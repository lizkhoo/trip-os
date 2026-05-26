// Ambient declaration so Agent 4 can guard-import Agent 2's syncGmail before it lands.
// The real implementation will export the same runGmailSync signature.
declare module '@/services/syncGmail' {
  export function runGmailSync(): Promise<void>;
}
