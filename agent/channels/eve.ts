import { eveChannel } from "eve/channels/eve";
import { authenticate } from "../../src/server/auth";

export default eveChannel({
  auth: async (request: Request) => {
    const principal = authenticate(request);
    if (!principal) return null;
    return { authenticator: "oct3", principalType: principal.role === "manager" ? "user" : "service", principalId: principal.id, attributes: { workspace_id: principal.workspace_id, role: principal.role } };
  },
});
