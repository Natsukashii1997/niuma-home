import { json, route, pending } from "../http.mjs";
import { listAssistants } from "../db.mjs";

export function routes(db) {
  return [
    route("GET", "/api/assistants", (req, res) => json(res, 200, listAssistants(db))),
    route("POST", "/api/assistants", pending("T04")),
    route("PATCH", "/api/assistants/:id", pending("T04")),
    route("GET", "/api/assistants/:id/messages", pending("T04")),
    route("POST", "/api/assistants/:id/messages", pending("T04")),
    route("GET", "/api/codex/sessions", pending("T04")),
    route("POST", "/api/assistants/import", pending("T04")),
  ];
}
