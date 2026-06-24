// GET /logout -> clear the session cookie, back to home.
import { clearCookie } from "./_auth.js";
export async function onRequestGet() {
  return new Response(null, { status: 303, headers: { 'Location': '/', 'Set-Cookie': clearCookie } });
}
