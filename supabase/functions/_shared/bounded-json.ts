export type JsonLimits = {
  maxDepth: number;
  maxNodes: number;
  maxObjectKeys: number;
  maxArrayLength: number;
  maxStringLength: number;
};

export const DEFAULT_JSON_LIMITS: Readonly<JsonLimits> = Object.freeze({
  maxDepth: 16,
  maxNodes: 1_024,
  maxObjectKeys: 128,
  maxArrayLength: 256,
  maxStringLength: 32_768,
});

export class BoundedJsonError extends Error {
  readonly code: string;

  constructor(code: string) {
    super(code);
    this.name = "BoundedJsonError";
    this.code = code;
  }
}

/**
 * A deliberately small JSON parser used before webhook dispatch. JSON.parse
 * silently accepts duplicate object keys by keeping the last value; signed
 * webhook safety decisions must reject that ambiguity instead. This parser
 * also bounds depth, total values, object width, array length, and strings.
 */
export function parseBoundedJsonObject(
  text: string,
  limits: JsonLimits = DEFAULT_JSON_LIMITS,
): Record<string, unknown> {
  let index = 0;
  let nodes = 0;

  const fail = (code: string): never => {
    throw new BoundedJsonError(code);
  };

  const whitespace = () => {
    while (index < text.length) {
      const code = text.charCodeAt(index);
      if (code !== 0x09 && code !== 0x0a && code !== 0x0d && code !== 0x20) {
        break;
      }
      index += 1;
    }
  };

  const parseString = (): string => {
    if (text[index] !== '"') fail("INVALID_JSON");
    const start = index;
    index += 1;
    let escaped = false;
    while (index < text.length) {
      const code = text.charCodeAt(index);
      if (!escaped && code === 0x22) {
        index += 1;
        const raw = text.slice(start, index);
        let value: unknown;
        try {
          value = JSON.parse(raw);
        } catch {
          return fail("INVALID_JSON_STRING");
        }
        if (typeof value !== "string") return fail("INVALID_JSON_STRING");
        if (value.length > limits.maxStringLength) fail("JSON_STRING_LIMIT");
        return value;
      }
      if (!escaped && code < 0x20) fail("INVALID_JSON_STRING");
      if (!escaped && code === 0x5c) {
        escaped = true;
      } else {
        escaped = false;
      }
      index += 1;
    }
    return fail("INVALID_JSON_STRING");
  };

  const parseValue = (depth: number): unknown => {
    if (depth > limits.maxDepth) fail("JSON_DEPTH_LIMIT");
    nodes += 1;
    if (nodes > limits.maxNodes) fail("JSON_NODE_LIMIT");
    whitespace();
    const character = text[index];

    if (character === '"') return parseString();
    if (character === "{") {
      index += 1;
      whitespace();
      const object: Record<string, unknown> = Object.create(null);
      const seen = new Set<string>();
      let keyCount = 0;
      if (text[index] === "}") {
        index += 1;
        return object;
      }
      while (index < text.length) {
        whitespace();
        const key = parseString();
        if (seen.has(key)) fail("DUPLICATE_JSON_KEY");
        seen.add(key);
        keyCount += 1;
        if (keyCount > limits.maxObjectKeys) fail("JSON_OBJECT_KEY_LIMIT");
        whitespace();
        if (text[index] !== ":") fail("INVALID_JSON");
        index += 1;
        object[key] = parseValue(depth + 1);
        whitespace();
        if (text[index] === "}") {
          index += 1;
          return object;
        }
        if (text[index] !== ",") fail("INVALID_JSON");
        index += 1;
      }
      return fail("INVALID_JSON");
    }
    if (character === "[") {
      index += 1;
      whitespace();
      const array: unknown[] = [];
      if (text[index] === "]") {
        index += 1;
        return array;
      }
      while (index < text.length) {
        if (array.length >= limits.maxArrayLength) fail("JSON_ARRAY_LIMIT");
        array.push(parseValue(depth + 1));
        whitespace();
        if (text[index] === "]") {
          index += 1;
          return array;
        }
        if (text[index] !== ",") fail("INVALID_JSON");
        index += 1;
      }
      return fail("INVALID_JSON");
    }

    for (
      const [literal, value] of [
        ["true", true],
        ["false", false],
        ["null", null],
      ] as const
    ) {
      if (text.startsWith(literal, index)) {
        index += literal.length;
        return value;
      }
    }

    const numberMatch = text.slice(index).match(
      /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/,
    );
    if (numberMatch) {
      index += numberMatch[0].length;
      const value = Number(numberMatch[0]);
      if (!Number.isFinite(value)) fail("INVALID_JSON_NUMBER");
      return value;
    }
    return fail("INVALID_JSON");
  };

  whitespace();
  const parsed = parseValue(0);
  whitespace();
  if (index !== text.length) fail("INVALID_JSON_TRAILING_DATA");
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    fail("JSON_OBJECT_REQUIRED");
  }
  return parsed as Record<string, unknown>;
}
