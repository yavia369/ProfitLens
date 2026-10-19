/** Role names and what each may do (shared by server pages and client controls). */
export const ROLE_LABEL: Record<string, string> = { owner: "Owner", admin: "Admin", editor: "Editor", viewer: "Viewer" };

export const ROLE_DESCRIPTION: Record<string, string> = {
  owner: "Everything, including granting or removing owners.",
  admin: "Connect stores and ad accounts, invite and manage members (not owners).",
  editor: "Edit costs, expenses and ad spend.",
  viewer: "View reports only.",
};

/** Roles the current user may hand out (only owners grant owner). */
export function grantableRoles(myRole: string): readonly string[] {
  return myRole === "owner" ? ["owner", "admin", "editor", "viewer"] : ["admin", "editor", "viewer"];
}
