import { createBrowserRouter } from 'react-router'
import AppLayout from './components/AppLayout'
import DashboardPage from './pages/DashboardPage'
import DesignPage from './pages/DesignPage'
import EventPage from './pages/EventPage'
import HomePage from './pages/HomePage'
import InvitationPage from './pages/InvitationPage'
import LoginPage from './pages/LoginPage'
import ScannerPage from './pages/ScannerPage'

export const router = createBrowserRouter([
  // Sitio público: paquetes y precios.
  { path: '/', element: <HomePage /> },
  { path: '/login', element: <LoginPage /> },
  // Panel del cliente (requiere sesión).
  {
    path: '/app',
    element: <AppLayout />,
    children: [
      { index: true, element: <DashboardPage /> },
      { path: 'events/:id', element: <EventPage /> },
      { path: 'events/:id/design', element: <DesignPage /> },
    ],
  },
  // Invitación pública de cada invitado (link y QR).
  { path: '/i/:token', element: <InvitationPage /> },
  // Hostess el día del evento.
  { path: '/staff', element: <ScannerPage /> },
])
