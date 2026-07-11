import { NavLink, Outlet } from 'react-router-dom';

const tabs = [
  { to: '/', ico: '🏠', label: 'Home' },
  { to: '/sets', ico: '🗂️', label: 'Sets' },
  { to: '/scan', ico: '📷', label: 'Scan' },
  { to: '/decks', ico: '🃏', label: 'Decks' },
  { to: '/vault', ico: '🔐', label: 'Vault' },
];

export function App() {
  return (
    <>
      <main>
        <Outlet />
      </main>
      <nav className="bottom">
        {tabs.map((tab) => (
          <NavLink
            key={tab.to}
            to={tab.to}
            end={tab.to === '/'}
            className={({ isActive }) => (isActive ? 'active' : '')}
          >
            <span className="ico">{tab.ico}</span>
            {tab.label}
          </NavLink>
        ))}
      </nav>
    </>
  );
}
