export class DiscordRestClient {
  constructor({ token, baseUrl = 'https://discord.com/api/v10', fetchImpl = fetch }) {
    if (!token) throw new Error('DISCORD_BOT_TOKEN is required');
    this.token = token;
    this.baseUrl = baseUrl;
    this.fetch = fetchImpl;
  }

  async request({ method, path, body, auditLogReason }) {
    const headers = { Authorization: `Bot ${this.token}` };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (auditLogReason) headers['X-Audit-Log-Reason'] = encodeURIComponent(auditLogReason);

    const response = await this.fetch(`${this.baseUrl}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await response.text();
    let parsed = null;
    if (text) {
      try { parsed = JSON.parse(text); } catch { parsed = text; }
    }
    return { status: response.status, body: parsed };
  }
}
