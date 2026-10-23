import { renderToString } from 'react-dom/server';
import { MemoryRouter } from 'react-router';
import { Landing } from './Landing';
export function renderLanding() {
  return renderToString(
    <MemoryRouter>
      <Landing />
    </MemoryRouter>,
  );
}
