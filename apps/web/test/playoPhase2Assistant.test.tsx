import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { AssistantPage } from '../src/pages/AssistantPage';

describe('P2-FE2 — grounded AI assistant', () => {
  it('renders both assistant journeys and makes the no-autonomy boundary explicit', () => {
    const html = renderToStaticMarkup(
      <MemoryRouter initialEntries={['/assistant']}>
        <AssistantPage />
      </MemoryRouter>,
    );

    expect(html).toContain('Trợ lý AI');
    expect(html).toContain('Gợi ý kèo');
    expect(html).toContain('Chat hỗ trợ');
    expect(html).toContain('AI không tự thực hiện');
    expect(html).not.toContain('Tham gia ngay');
  });
});
