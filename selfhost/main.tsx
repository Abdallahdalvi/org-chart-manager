import { createRoot } from 'react-dom/client';
import Workspace from '../components/workspace';
import '../app/globals.css';

createRoot(document.getElementById('root')!).render(
  <Workspace requireSession />,
);
