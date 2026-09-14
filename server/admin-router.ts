import { resolveAdminGithubToken } from "../lib/admin-integrations-logic";
import { adminProcedure, router } from "./_core/trpc";

/**
 * Sprint 87 — Admin-Auto-Provisioning: server-seitig hinterlegte Secrets
 * (GitHub-Token) werden dem Administrator automatisch bereitgestellt, ohne
 * dass er sie manuell in den Settings einfuegen muss. adminProcedure prueft
 * bereits serverseitig role === "admin" — dieser Router liefert das Token
 * nur an einen bereits als Administrator authentifizierten Aufrufer.
 */
export const adminRouter = router({
  githubToken: adminProcedure.query(() => {
    const result = resolveAdminGithubToken(
      { ADMIN_GITHUB_TOKEN: process.env.ADMIN_GITHUB_TOKEN, GITHUB_TOKEN: process.env.GITHUB_TOKEN },
      true,
    );
    return result.available ? { token: result.token } : { token: null };
  }),
});
