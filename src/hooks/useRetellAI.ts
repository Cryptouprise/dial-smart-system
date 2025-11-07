import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

export const useRetellAI = () => {
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  // Replace mock with a real server-side check call
  const getRetellCredentials = async () => {
    try {
      const { data, error } = await supabase.functions.invoke("retell-credentials-check", {});
      if (error) {
        console.error("retell-credentials-check invocation error:", error);
        return false;
      }
      return !!(data && (data as any).ok);
    } catch (err: any) {
      console.error("Failed to validate Retell credentials:", err?.message || err);
      return false;
    }
  };

  const importPhoneNumber = async (phoneNumber: string, terminationUri: string) => {
    setIsLoading(true);
    try {
      console.log("[useRetellAI] Importing phone number:", { phoneNumber });
      const { data, error } = await supabase.functions.invoke("retell-phone-management", {
        body: {
          action: "import",
          phoneNumber,
          terminationUri
        }
      });

      if (error) {
        throw error;
      }

      toast({
        title: "Phone Imported",
        description: `${phoneNumber} imported`,
      });

      return data;
    } catch (err: any) {
      console.error("useRetellAI import error:", err?.message || err);
      toast({
        title: "Import Failed",
        description: err?.message || "Failed to import number",
        variant: "destructive"
      });
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  return {
    isLoading,
    getRetellCredentials,
    importPhoneNumber
  };
};
