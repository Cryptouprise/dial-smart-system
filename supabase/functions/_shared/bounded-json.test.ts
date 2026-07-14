// deno-lint-ignore-file no-import-prefix -- repository Edge tests pin the deployed Deno std version.
import {
  assertEquals,
  assertThrows,
} from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { BoundedJsonError, parseBoundedJsonObject } from "./bounded-json.ts";

function assertCode(source: string, code: string): void {
  const error = assertThrows(
    () => parseBoundedJsonObject(source),
    BoundedJsonError,
  );
  assertEquals(error.code, code);
}

Deno.test("parses a bounded object without prototype mutation", () => {
  const parsed = parseBoundedJsonObject(
    '{"type":"ContactCreate","nested":{"ok":true},"items":[1,null,"x"],"__proto__":{"x":1}}',
  );
  assertEquals(parsed.type, "ContactCreate");
  assertEquals((parsed.nested as Record<string, unknown>).ok, true);
  assertEquals(Object.getPrototypeOf(parsed), null);
  assertEquals((parsed.__proto__ as Record<string, unknown>).x, 1);
});

Deno.test("rejects duplicate keys at the root and nested levels", () => {
  assertCode(
    '{"type":"ContactCreate","type":"ContactUpdate"}',
    "DUPLICATE_JSON_KEY",
  );
  assertCode('{"x":{"dnd":false,"dnd":true}}', "DUPLICATE_JSON_KEY");
  assertCode('{"x":1,"\\u0078":2}', "DUPLICATE_JSON_KEY");
});

Deno.test("enforces depth, node, object, array, and string limits", () => {
  assertCode(`${'{"x":'.repeat(18)}null${"}".repeat(18)}`, "JSON_DEPTH_LIMIT");
  assertThrows(
    () =>
      parseBoundedJsonObject('{"a":1,"b":2}', {
        maxDepth: 16,
        maxNodes: 1,
        maxObjectKeys: 128,
        maxArrayLength: 256,
        maxStringLength: 32_768,
      }),
    BoundedJsonError,
    "JSON_NODE_LIMIT",
  );
  assertThrows(
    () =>
      parseBoundedJsonObject('{"a":1,"b":2}', {
        maxDepth: 16,
        maxNodes: 1_024,
        maxObjectKeys: 1,
        maxArrayLength: 256,
        maxStringLength: 32_768,
      }),
    BoundedJsonError,
    "JSON_OBJECT_KEY_LIMIT",
  );
  assertThrows(
    () =>
      parseBoundedJsonObject('{"a":[1,2]}', {
        maxDepth: 16,
        maxNodes: 1_024,
        maxObjectKeys: 128,
        maxArrayLength: 1,
        maxStringLength: 32_768,
      }),
    BoundedJsonError,
    "JSON_ARRAY_LIMIT",
  );
  assertThrows(
    () =>
      parseBoundedJsonObject('{"a":"long"}', {
        maxDepth: 16,
        maxNodes: 1_024,
        maxObjectKeys: 128,
        maxArrayLength: 256,
        maxStringLength: 3,
      }),
    BoundedJsonError,
    "JSON_STRING_LIMIT",
  );
});

Deno.test("rejects trailing data, arrays at root, malformed escapes, and nonfinite numbers", () => {
  assertCode("{}{}", "INVALID_JSON_TRAILING_DATA");
  assertCode("[]", "JSON_OBJECT_REQUIRED");
  assertCode('{"x":"\\uZZZZ"}', "INVALID_JSON_STRING");
  assertCode('{"x":1e999}', "INVALID_JSON_NUMBER");
});
