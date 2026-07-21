export class OpenAICompatibleClient {
  constructor({ apiKey, baseUrl, model, fetchImpl = fetch }) {
    if (!apiKey) throw new Error('MODEL_API_KEY is required');
    this.apiKey = apiKey;
    this.baseUrl = baseUrl ?? 'https://api.openai.com/v1';
    this.model = model;
    this.fetch = fetchImpl;
  }

  async chat({ messages, tools }) {
    const response = await this.fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ model: this.model, messages, tools }),
    });
    if (!response.ok) throw new Error(`Model API failed: HTTP ${response.status}`);
    const data = await response.json();
    return data.choices?.[0]?.message ?? { role: 'assistant', content: '' };
  }
}
