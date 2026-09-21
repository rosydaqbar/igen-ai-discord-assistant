export class JevSystemOneClient {
  constructor({
    apiKey,
    model = 'jev-latest',
    baseUrl = 'https://api.typesafe.ai',
    fetchImpl = fetch,
  }) {
    if (!apiKey) throw new Error('TYPESAFE_API_KEY is required');
    this.apiKey = apiKey;
    this.model = model;
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.fetch = fetchImpl;
  }

  async systemOne({ state, questions, model = this.model }) {
    const response = await this.fetch(this.baseUrl + '/v1/systemone', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + this.apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ model, state, questions }),
    });

    const text = await response.text();
    let data = null;
    if (text) {
      try {
        data = JSON.parse(text);
      } catch {
        data = text;
      }
    }

    if (!response.ok) {
      throw new Error(
        'TypeSafe System One failed: HTTP ' + response.status +
        (typeof data === 'string' ? ' ' + data.slice(0, 300) : ''),
      );
    }

    return data;
  }
}

export function choiceQuestion(instructions, criteria) {
  return {
    type: 'choice',
    instructions,
    criteria,
  };
}

export function noulQuestion(instructions) {
  return {
    type: 'noul',
    instructions,
  };
}
