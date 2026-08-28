import { useState, useEffect } from 'react';
import { api } from '../../../lib/api';
import { Skeleton } from '../../components/ui/skeleton';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Badge } from '../../components/ui/badge';
import { Trophy, Users, Calendar, Plus, School, Medal, Edit, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { CompetitionModal } from '../../components/modals/CompetitionModal';

export function CompetitionsPage() {
  const [loading, setLoading] = useState(true);
  const [competitions, setCompetitions] = useState<any[]>([]);
  const [leaderboard, setLeaderboard] = useState<any[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedComp, setSelectedComp] = useState<any>(null);

  useEffect(() => { fetchCompetitions(); }, []);

  const fetchCompetitions = async () => {
    try {
      const data = await api.getCompetitions();
      setCompetitions(data?.competitions || data || []);
      setLeaderboard(data?.leaderboard || []);
      setStats(data?.stats || null);
    } catch {
      setCompetitions([]);
      setLeaderboard([]);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await api.deleteCompetition(id);
      toast.success('Competition deleted');
      fetchCompetitions();
    } catch {
      toast.error('Failed to delete competition');
    }
  };

  const handleEdit = (comp: any) => {
    setSelectedComp(comp);
    setIsModalOpen(true);
  };

  const statusConfig: Record<string, { label: string; className: string }> = {
    active: { label: 'Active', className: 'bg-emerald-50 text-emerald-700' },
    upcoming: { label: 'Upcoming', className: 'bg-blue-50 text-blue-700' },
    registration: { label: 'Registration Open', className: 'bg-amber-50 text-amber-700' },
    completed: { label: 'Completed', className: 'bg-gray-100 text-gray-500' },
  };

  const rankColors: Record<number, { bg: string; text: string }> = {
    1: { bg: 'bg-amber-400', text: 'text-white' },
    2: { bg: 'bg-gray-300', text: 'text-gray-800' },
    3: { bg: 'bg-amber-600', text: 'text-white' },
  };

  if (loading) {
    return (
      <div className="space-y-6 max-w-full overflow-x-hidden">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
          {[1,2,3,4].map(i => <Skeleton key={i} className="h-24 rounded-2xl" />)}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <Skeleton className="lg:col-span-2 h-[500px] rounded-2xl" />
          <Skeleton className="h-[500px] rounded-2xl" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8 max-w-full overflow-x-hidden pb-10">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 tracking-tight">Competitions</h1>
          <p className="text-sm text-gray-500 font-medium mt-1">Inter-school events, rankings, and leaderboard</p>
        </div>
        <Button 
          className="bg-blue-600 hover:bg-blue-700 h-11 px-6 rounded-xl shadow-xl shadow-blue-600/20 font-bold text-xs"
          onClick={() => { setSelectedComp(null); setIsModalOpen(true); }}
        >
          <Plus className="w-4 h-4 mr-2" /> Add Competition
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
        {[
          { label: 'Total Events', value: stats?.total ?? competitions.length ?? 0, icon: Trophy, color: 'text-blue-600', bg: 'bg-blue-50 border-blue-100' },
          { label: 'Upcoming', value: stats?.upcoming ?? competitions.filter(c => c.status === 'upcoming').length ?? 0, icon: Calendar, color: 'text-emerald-600', bg: 'bg-emerald-50 border-emerald-100' },
          { label: 'Participants', value: stats?.participants ?? competitions.reduce((a: number, c: any) => a + (c.participants || 0), 0) ?? 0, icon: Users, color: 'text-purple-600', bg: 'bg-purple-50 border-purple-100' },
          { label: 'Partner Schools', value: stats?.schools ?? 0, icon: School, color: 'text-amber-600', bg: 'bg-amber-50 border-amber-100' },
        ].map((s) => {
          const Icon = s.icon;
          return (
            <Card key={s.label} className="border-none shadow-sm bg-white overflow-hidden group">
              <CardContent className="p-6">
                <div className="flex items-center gap-4">
                  <div className={`w-12 h-12 ${s.bg} rounded-xl flex items-center justify-center border group-hover:scale-110 transition-transform`}>
                    <Icon className={`w-6 h-6 ${s.color}`} />
                  </div>
                  <div>
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">{s.label}</p>
                    <p className="text-2xl font-bold text-gray-900">{s.value}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Competition List */}
        <Card className="lg:col-span-2 border-none shadow-sm bg-white overflow-hidden">
          <CardHeader className="py-5 px-6 border-b border-gray-50">
            <CardTitle className="text-sm font-bold text-gray-900">Active & Upcoming Events</CardTitle>
          </CardHeader>
          <CardContent className="p-6 space-y-4">
            {competitions.map((comp) => {
              const status = statusConfig[comp.status] || statusConfig.upcoming;
              return (
                <div key={comp.id} className="p-5 bg-gray-50 rounded-2xl hover:bg-white hover:shadow-md border border-transparent hover:border-gray-100 transition-all group cursor-pointer">
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <h3 className="font-bold text-sm text-gray-900 group-hover:text-blue-600 transition-colors leading-tight">{comp.name}</h3>
                      <p className="text-xs font-medium text-gray-400 mt-0.5">{comp.date}</p>
                    </div>
                    <Badge className={`text-[10px] font-bold px-2 py-0.5 rounded-full border-none flex-shrink-0 ml-3 ${status.className}`}>
                      {status.label}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-4 flex-wrap">
                    <Badge className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border-none">{comp.type}</Badge>
                    <span className="flex items-center gap-1.5 text-xs font-medium text-gray-500">
                      <Users className="w-3.5 h-3.5" /> {comp.participants} participants
                    </span>
                    <span className="flex items-center gap-1.5 text-xs font-medium text-gray-500">
                      <School className="w-3.5 h-3.5" /> {comp.schools} schools
                    </span>
                  </div>
                  <div className="flex gap-2 mt-4">
                    <Button 
                      size="sm" 
                      variant="outline" 
                      className="h-8 px-4 rounded-lg font-bold text-xs border-gray-200 gap-1.5"
                      onClick={() => handleEdit(comp)}
                    >
                      <Edit className="w-3 h-3" /> Edit
                    </Button>
                    <Button 
                      size="sm" 
                      variant="outline" 
                      className="h-8 px-4 rounded-lg font-bold text-xs border-gray-200 text-red-600 hover:bg-red-50 hover:border-red-100"
                      onClick={() => handleDelete(comp.id)}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>

        {/* Leaderboard */}
        <Card className="border-none shadow-sm bg-white overflow-hidden">
          <CardHeader className="py-5 px-6 border-b border-gray-50">
            <CardTitle className="text-sm font-bold text-gray-900 flex items-center gap-2">
              <Medal className="w-4 h-4 text-amber-500" /> School Leaderboard
            </CardTitle>
          </CardHeader>
          <CardContent className="p-5 space-y-3">
            {leaderboard.map((entry) => {
              const rankStyle = rankColors[entry.rank] || { bg: 'bg-blue-50', text: 'text-blue-700' };
              return (
                <div key={entry.rank} className="flex items-center gap-4 p-4 bg-gray-50 rounded-xl hover:bg-white hover:shadow-sm border border-transparent hover:border-gray-100 transition-all">
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center font-bold text-sm flex-shrink-0 ${rankStyle.bg} ${rankStyle.text}`}>
                    {entry.rank <= 3 ? <Trophy className="w-4 h-4" /> : `#${entry.rank}`}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-sm text-gray-900 truncate">{entry.student}</p>
                    <p className="text-[10px] font-medium text-gray-400">{entry.class} · {entry.competitions} events</p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-lg font-bold text-blue-600">{entry.points}</p>
                    <p className="text-[10px] font-bold text-gray-400 uppercase">pts</p>
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      </div>

      <CompetitionModal 
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSuccess={fetchCompetitions}
        competition={selectedComp}
      />
    </div>
  );
}
