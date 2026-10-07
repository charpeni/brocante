import { createRoot } from 'react-dom/client';
import Marketplace from '../../web/src/components/Marketplace';
import '../../web/src/styles/app.css';
import logoSrc from '../../web/public/brand/brocante-logo.svg';
import type { Report } from '@brocante/core';

const report: Report = JSON.parse(document.getElementById('brocante-data')!.textContent!);

createRoot(document.getElementById('brocante')!).render(
  <Marketplace
    initialLocation={{ repository: report.demo ? '' : report.repository, search: '' }}
    initialAuthError={null}
    logoSrc={logoSrc}
    savedSnapshot={{
      data: { ...report, nextCursor: null },
      complete: report.complete,
      search: report.search,
      demo: report.demo,
    }}
  />,
);
