import type { Message } from '@sjn/shared';
export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public code: string,
  ) {
    super(message);
  }
}
export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`/api${path}`, {
    ...options,
    credentials: 'include',
    headers: {
      'X-SJN-Request': '1',
      ...(options.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
      ...options.headers,
    },
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new ApiError(
      body.error?.message || 'Unable to connect. Please try again.',
      response.status,
      body.error?.code || 'NETWORK',
    );
  }
  return response.status === 204 ? (undefined as T) : ((await response.json()) as T);
}
export const json = (value: unknown) => JSON.stringify(value);
export async function streamAnswer(
  id: string,
  question: string,
  requestId: string,
  onDelta: (text: string) => void,
): Promise<Message> {
  const response = await fetch(`/api/conversations/${id}/messages`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', 'X-SJN-Request': '1' },
    body: json({ question, requestId }),
  });
  if (!response.ok) {
    const data = await response.json();
    throw new ApiError(data.error.message, response.status, data.error.code);
  }
  const reader = response.body!.getReader(),
    decoder = new TextDecoder();
  let buffer = '',
    answer: Message | undefined;
  while (true) {
    const { value, done } = await reader.read();
    buffer += decoder.decode(value, { stream: !done });
    let boundary;
    while ((boundary = buffer.indexOf('\n\n')) >= 0) {
      const line = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);
      if (line.startsWith('data: ')) {
        const event = JSON.parse(line.slice(6));
        if (event.type === 'delta') onDelta(event.text);
        if (event.type === 'done') answer = event.message;
      }
    }
    if (done) break;
  }
  if (!answer) throw new Error('The response was interrupted. Retry your question.');
  return answer;
}
