// Called from the project's own "postinstall" script:
//   node -e "import('@przemeq25/agent-workflow/postinstall').catch(()=>{})"
// It refreshes the managed files and the adapters of the tools chosen in `agent-workflow init` after every
// install, and never fails the install (production installs without dev dependencies simply skip it).
// It never picks a tool on its own: no tools configured means no adapters.
import { existsSync } from "node:fs";
import { join } from "node:path";
import { syncProject } from "./sync.mjs";

const root = process.env.INIT_CWD ?? process.cwd();
// Skipped until `agent-workflow init` has run, when .agents/ is missing (e.g. a deploy upload that
// excludes it) and on request.
if (
	process.env.AGENT_WORKFLOW_SKIP_POSTINSTALL !== "1" &&
	existsSync(join(root, ".agents", "workflow.json"))
) {
	try {
		syncProject(root, { quiet: false });
	} catch (e) {
		console.warn(`[agent-workflow] sync skipped: ${e.message}`);
	}
}
