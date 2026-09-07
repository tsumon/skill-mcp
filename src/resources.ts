import { bindingContract, resolveBinding } from "./bind.js";

type Env = NodeJS.ProcessEnv;

export const BINDING_CONTRACT_URI = "skill-mcp://binding/contract";

export type BindingResource = {
  uri: string;
  name: string;
  description: string;
  mimeType: string;
};

export function listBindingResources(): BindingResource[] {
  return [
    {
      uri: BINDING_CONTRACT_URI,
      name: "binding-contract",
      description: "Host/model may use only the currently bound skills",
      mimeType: "text/plain",
    },
  ];
}

export function readBindingResource(uri: string, env: Env = process.env): { uri: string; mimeType: string; text: string } {
  if (uri !== BINDING_CONTRACT_URI) {
    throw new Error("Unknown resource: " + uri);
  }
  return {
    uri,
    mimeType: "text/plain",
    text: bindingContract(resolveBinding(env).state),
  };
}
