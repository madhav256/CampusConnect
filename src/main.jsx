import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { AuthProvider } from "./contexts/AuthContext";
import { CampusProvider } from "./contexts/CampusContext";

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <AuthProvider>
      <CampusProvider>
        <App />
      </CampusProvider>
    </AuthProvider>
  </StrictMode>,
)
