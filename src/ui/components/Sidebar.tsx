import React from 'react';
import { NavLink } from 'react-router-dom';
import { LayoutDashboard, FileText, Zap, ShoppingCart, ExternalLink, Clapperboard } from 'lucide-react';

export function Sidebar() {
  return (
    <aside className="w-60 flex-shrink-0 bg-slate-900 flex flex-col h-full">
      {/* Logo */}
      <div className="px-6 pt-7 pb-6 border-b border-slate-700">
        <div className="flex items-center gap-2 mb-1">
          <Zap className="text-indigo-400" size={22} strokeWidth={2.5} />
          <span className="text-white font-bold text-lg tracking-tight">Spark Bid</span>
        </div>
        <p className="text-slate-400 text-xs font-medium tracking-wide">Proposal Platform</p>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-5 space-y-1">

        {/* GSA Section */}
        <div className="pb-1">
          <p className="px-3 text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">GSA</p>
        </div>

        <NavLink
          to="/"
          end
          className={({ isActive }) =>
            `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors duration-150 ${
              isActive
                ? 'bg-indigo-600 text-white'
                : 'text-slate-300 hover:bg-slate-800 hover:text-white'
            }`
          }
        >
          <LayoutDashboard size={18} />
          Opportunities
        </NavLink>

        <NavLink
          to="/proposals"
          className={({ isActive }) =>
            `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors duration-150 ${
              isActive
                ? 'bg-indigo-600 text-white'
                : 'text-slate-300 hover:bg-slate-800 hover:text-white'
            }`
          }
        >
          <FileText size={18} />
          GSA Proposals
        </NavLink>

        {/* Commercial Section */}
        <div className="pt-4 pb-1">
          <p className="px-3 text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Commercial</p>
        </div>

        <NavLink
          to="/commercial"
          className={({ isActive }) =>
            `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors duration-150 ${
              isActive
                ? 'bg-indigo-600 text-white'
                : 'text-slate-300 hover:bg-slate-800 hover:text-white'
            }`
          }
        >
          <Clapperboard size={18} />
          Proposals
        </NavLink>

        {/* Divider */}
        <div className="pt-4 pb-1">
          <p className="px-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">External</p>
        </div>

        {/* GSA eBuy */}
        <a
          href="https://www.ebuy.gsa.gov/ebuy/seller"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-slate-300 hover:bg-slate-800 hover:text-white transition-colors duration-150"
        >
          <ShoppingCart size={18} />
          <span className="flex-1">GSA eBuy</span>
          <ExternalLink size={13} className="text-slate-500" />
        </a>

        {/* SAM.gov */}
        <a
          href="https://sam.gov/search/?index=opp&sort=-modifiedDate&sfm%5BsimpleSearch%5D%5BkeywordRadio%5D=ALL&sfm%5BsimpleSearch%5D%5BkeywordTags%5D%5B0%5D%5Bkey%5D=512110&sfm%5BsimpleSearch%5D%5BkeywordTags%5D%5B0%5D%5Bvalue%5D=512110"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-slate-300 hover:bg-slate-800 hover:text-white transition-colors duration-150"
        >
          <LayoutDashboard size={18} />
          <span className="flex-1">SAM.gov</span>
          <ExternalLink size={13} className="text-slate-500" />
        </a>
      </nav>

      {/* Footer */}
      <div className="px-6 py-5 border-t border-slate-700">
        <p className="text-slate-400 text-xs font-medium">Digital Spark Studios</p>
        <p className="text-slate-500 text-xs mt-0.5">SIN 512110</p>
      </div>
    </aside>
  );
}
