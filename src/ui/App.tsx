import React, { useState } from 'react';
import { Routes, Route } from 'react-router-dom';
import { Sidebar } from './components/Sidebar';
import { Dashboard } from './pages/Dashboard';
import { OpportunityDetail } from './pages/OpportunityDetail';
import { ProposalView } from './pages/ProposalView';
import { ProposalsList } from './pages/ProposalsList';
import { Login } from './pages/Login';
import { isAuthenticated } from './lib/auth';

export default function App() {
  const [authed, setAuthed] = useState(isAuthenticated());

  if (!authed) {
    return <Login onLogin={() => setAuthed(true)} />;
  }

  return (
    <div className="flex h-screen bg-gray-50 overflow-hidden">
      <Sidebar />
      <main className="flex-1 overflow-y-auto">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/opportunities/:id" element={<OpportunityDetail />} />
          <Route path="/proposals" element={<ProposalsList />} />
          <Route path="/proposals/:opportunityId" element={<ProposalView />} />
        </Routes>
      </main>
    </div>
  );
}
