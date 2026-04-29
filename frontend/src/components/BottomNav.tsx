import { Mail, Package, Settings } from 'lucide-react';

interface BottomNavProps {
  activeTab: 'emails' | 'orders';
  onTabChange: (tab: 'emails' | 'orders') => void;
  onSettings: () => void;
  showSettings: boolean;
}

export default function BottomNav({ activeTab, onTabChange, onSettings, showSettings }: BottomNavProps) {
  const tabs = [
    { id: 'emails' as const, label: 'E-Mails',      Icon: Mail },
    { id: 'orders' as const, label: 'Bestellungen', Icon: Package },
  ];

  return (
    <div className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-md bg-white border-t border-gray-100 safe-bottom z-20">
      <div className="grid grid-cols-3">
        {tabs.map(({ id, label, Icon }) => {
          const active = activeTab === id && !showSettings;
          return (
            <button
              key={id}
              onClick={() => onTabChange(id)}
              className={`relative flex flex-col items-center justify-center py-3 gap-1 transition-colors ${
                active ? 'text-blue-600' : 'text-gray-400 hover:text-gray-600'
              }`}
            >
              <Icon className="w-6 h-6" />
              <span className="text-xs font-medium">{label}</span>
              {active && (
                <div className="absolute bottom-0 w-12 h-0.5 bg-blue-600 rounded-t-full" />
              )}
            </button>
          );
        })}

        {/* Settings */}
        <button
          onClick={onSettings}
          className={`relative flex flex-col items-center justify-center py-3 gap-1 transition-colors ${
            showSettings ? 'text-blue-600' : 'text-gray-400 hover:text-gray-600'
          }`}
        >
          <Settings className="w-6 h-6" />
          <span className="text-xs font-medium">Einstellungen</span>
          {showSettings && (
            <div className="absolute bottom-0 w-12 h-0.5 bg-blue-600 rounded-t-full" />
          )}
        </button>
      </div>
    </div>
  );
}
