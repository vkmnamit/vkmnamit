import { useState } from 'react';
import { Search, X } from 'lucide-react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';

export function GlobalSearchFAB() {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');

  return (
    <div className="fixed bottom-6 right-6 z-50 flex items-end justify-end">
      {isOpen && (
        <div className="mb-4 mr-4 bg-white rounded-2xl shadow-2xl border border-gray-100 p-3 w-72 animate-in fade-in slide-in-from-bottom-4 duration-200 flex items-center gap-2 absolute bottom-full right-0">
          <Search className="w-5 h-5 text-gray-400 shrink-0 ml-1" />
          <Input 
            autoFocus
            placeholder="Search everything..." 
            className="border-none bg-transparent shadow-none focus-visible:ring-0 px-1 text-sm font-medium h-9"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
      )}
      <Button 
        onClick={() => setIsOpen(!isOpen)}
        className="h-14 w-14 rounded-full bg-blue-600 hover:bg-blue-700 shadow-xl shadow-blue-600/30 text-white flex items-center justify-center transition-transform hover:scale-105"
      >
        {isOpen ? <X className="w-6 h-6" /> : <Search className="w-6 h-6" />}
      </Button>
    </div>
  );
}
