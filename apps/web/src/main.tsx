import React from 'react';
import ReactDOM from 'react-dom/client';
import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import { App } from './App';
import { DeckDetail } from './pages/DeckDetail';
import { Decks } from './pages/Decks';
import { Home } from './pages/Home';
import { ImportCsv } from './pages/ImportCsv';
import { Products } from './pages/Products';
import { Rapid } from './pages/Rapid';
import { Recommendations } from './pages/Recommendations';
import { Scan } from './pages/Scan';
import { Search } from './pages/Search';
import { SetGrid } from './pages/SetGrid';
import { Sets } from './pages/Sets';
import { Vault } from './pages/Vault';
import './styles.css';

const router = createBrowserRouter([
  {
    path: '/',
    element: <App />,
    children: [
      { index: true, element: <Home /> },
      { path: 'sets', element: <Sets /> },
      { path: 'sets/:code', element: <SetGrid /> },
      { path: 'search', element: <Search /> },
      { path: 'products', element: <Products /> },
      { path: 'rapid', element: <Rapid /> },
      { path: 'csv', element: <ImportCsv /> },
      { path: 'scan', element: <Scan /> },
      { path: 'decks', element: <Decks /> },
      { path: 'decks/:id', element: <DeckDetail /> },
      { path: 'recs', element: <Recommendations /> },
      { path: 'vault', element: <Vault /> },
    ],
  },
]);

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <RouterProvider router={router} />
  </React.StrictMode>,
);
