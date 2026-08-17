import React, { useState } from 'react';
import { Outlet } from 'react-router-dom';
import { Menu } from 'lucide-react';
import AdminSidebar from './AdminSidebar';

const AdminLayout = () => {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="flex h-screen bg-gray-50 dark:bg-zinc-950 overflow-hidden">
      <div className="hidden lg:flex h-full">
        <AdminSidebar />
      </div>

      {sidebarOpen && (
        <div className="lg:hidden fixed inset-0 z-40 flex">
          <div className="fixed inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setSidebarOpen(false)} />
          <div className="relative z-50 flex h-full">
            <AdminSidebar onClose={() => setSidebarOpen(false)} />
          </div>
        </div>
      )}

      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <header className="lg:hidden sticky top-0 z-30 flex items-center justify-between px-4 py-3 bg-white dark:bg-zinc-900 border-b border-gray-200 dark:border-white/5 shadow-sm">
          <span className="text-lg font-black tracking-tighter text-gray-900 dark:text-zinc-100">
            PRONOUN<span className="text-accent">.</span>
          </span>
          <button onClick={() => setSidebarOpen(true)} aria-label="Open menu"
            className="p-2.5 -mr-1 text-gray-700 dark:text-zinc-300 hover:bg-gray-100 dark:hover:bg-zinc-800 rounded-lg transition-colors">
            <Menu size={22} />
          </button>
        </header>

        {/* pb-20 keeps the last row clear of phone home indicators / browser bars */}
        <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8 pb-20">
          <Outlet />
        </main>
      </div>
    </div>
  );
};

export default AdminLayout;
