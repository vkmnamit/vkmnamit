import { useState, useEffect } from 'react';
import { api } from '../../../lib/api';
import { Skeleton } from '../../components/ui/skeleton';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Badge } from '../../components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../components/ui/tabs';
import { Trophy, Users, Package, Plus, Calendar, Medal, Trash2, Edit, Activity, MoreVertical } from 'lucide-react';
import { toast } from 'sonner';
import { SportsTeamModal } from '../../components/modals/SportsTeamModal';
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuItem, 
  DropdownMenuTrigger 
} from '../../components/ui/dropdown-menu';

export function SportsPage() {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<any>(null);
  const [activeTab, setActiveTab] = useState('teams');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedTeam, setSelectedTeam] = useState<any>(null);

  useEffect(() => { fetchSportsData(); }, []);

  const fetchSportsData = async () => {
    try {
      const res = await api.getSportsData();
      setData(res);
    } catch {
      toast.error('Failed to load sports data');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteTeam = async (id: string) => {
    try {
      await api.deleteSportsTeam(id);
      toast.success('Team deleted');
      fetchSportsData();
    } catch {
      toast.error('Failed to delete team');
    }
  };

  const handleEditTeam = (team: any) => {
    setSelectedTeam(team);
    setIsModalOpen(true);
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-12 w-1/3 rounded-2xl" />
        <div className="grid grid-cols-2 md:grid-cols-3 gap-6">
          {[1,2,3].map(i => <Skeleton key={i} className="h-24 rounded-2xl" />)}
        </div>
        <Skeleton className="h-[400px] w-full rounded-2xl" />
      </div>
    );
  }

  const teams = data?.teams || [];
  const inventory = data?.inventory || [];
  const competitions = data?.competitions || [];

  return (
    <div className="space-y-8 max-w-full overflow-x-hidden pb-10">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 tracking-tight flex items-center gap-3">
            <Activity className="w-8 h-8 text-blue-600" /> Sports Hub
          </h1>
          <p className="text-sm text-gray-500 font-medium mt-1">Manage teams, equipment, and sports competitions</p>
        </div>
        <div className="flex gap-2">
          <Button 
            className="bg-blue-600 hover:bg-blue-700 h-11 px-6 rounded-xl shadow-xl shadow-blue-600/20 font-bold text-xs"
            onClick={() => { setSelectedTeam(null); setIsModalOpen(true); }}
          >
            <Plus className="w-4 h-4 mr-2" /> Add Team
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-6">
        {[
          { label: 'Active Teams', value: teams.length, icon: Users, color: 'text-blue-600', bg: 'bg-blue-50' },
          { label: 'Equipment Items', value: inventory.length, icon: Package, color: 'text-emerald-600', bg: 'bg-emerald-50' },
          { label: 'Total Competitions', value: competitions.length, icon: Trophy, color: 'text-purple-600', bg: 'bg-purple-50' },
        ].map((s) => (
          <Card key={s.label} className="border-none shadow-sm bg-white overflow-hidden group">
            <CardContent className="p-6 flex items-center gap-4">
              <div className={`w-12 h-12 ${s.bg} rounded-xl flex items-center justify-center border group-hover:scale-110 transition-transform`}>
                <s.icon className={`w-6 h-6 ${s.color}`} />
              </div>
              <div>
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">{s.label}</p>
                <p className="text-2xl font-bold text-gray-900">{s.value}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="bg-gray-100/50 p-1 rounded-xl w-full sm:w-auto overflow-x-auto h-12 gap-1">
          <TabsTrigger value="teams" className="rounded-lg px-6 font-bold text-xs data-[state=active]:bg-white data-[state=active]:shadow-sm data-[state=active]:text-blue-600 h-10">
            Sports Teams
          </TabsTrigger>
          <TabsTrigger value="inventory" className="rounded-lg px-6 font-bold text-xs data-[state=active]:bg-white data-[state=active]:shadow-sm data-[state=active]:text-blue-600 h-10">
            Equipment & Inventory
          </TabsTrigger>
          <TabsTrigger value="competitions" className="rounded-lg px-6 font-bold text-xs data-[state=active]:bg-white data-[state=active]:shadow-sm data-[state=active]:text-blue-600 h-10">
            Matches & Events
          </TabsTrigger>
        </TabsList>

        <TabsContent value="teams" className="space-y-6">
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-6">
            {teams.length === 0 ? (
              <div className="col-span-full py-20 text-center bg-white rounded-2xl shadow-sm border border-dashed border-gray-200">
                <Users className="w-12 h-12 text-gray-200 mx-auto mb-3" />
                <p className="text-sm font-bold text-gray-400">No teams registered yet.</p>
                <Button variant="outline" className="mt-4 h-9 rounded-xl font-bold text-xs border-gray-200">Create First Team</Button>
              </div>
            ) : (
              teams.map((team: any) => (
                <Card key={team.id} className="border-none shadow-sm bg-white overflow-hidden group hover:shadow-md transition-all">
                  <CardHeader className="pb-4">
                    <div className="flex items-center justify-between">
                      <Badge className="bg-blue-50 text-blue-700 text-[10px] font-bold border-none uppercase">{team.sport_type}</Badge>
                      
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="sm" className="h-8 w-8 p-0 rounded-lg">
                            <MoreVertical className="w-4 h-4 text-gray-400" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="rounded-xl">
                          <DropdownMenuItem className="font-bold text-xs gap-2" onClick={() => handleEditTeam(team)}>
                            <Edit className="w-3.5 h-3.5" /> Edit Team
                          </DropdownMenuItem>
                          <DropdownMenuItem className="font-bold text-xs gap-2 text-red-600 focus:text-red-600" onClick={() => handleDeleteTeam(team.id)}>
                            <Trash2 className="w-3.5 h-3.5" /> Delete Team
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                    <CardTitle className="text-base font-bold text-gray-900 mt-2">{team.name}</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="flex items-center justify-between text-xs font-medium text-gray-500">
                      <span className="flex items-center gap-1.5"><Users className="w-3.5 h-3.5" /> Members</span>
                      <span className="font-bold text-gray-900">{team.members?.length || 0} students</span>
                    </div>
                    <div className="flex items-center justify-between text-xs font-medium text-gray-500">
                      <span className="flex items-center gap-1.5"><Medal className="w-3.5 h-3.5" /> Coach</span>
                      <span className="font-bold text-gray-900">{team.coach ? `${team.coach.first_name} ${team.coach.last_name}` : 'Unassigned'}</span>
                    </div>
                    <Button size="sm" variant="outline" className="w-full h-9 rounded-xl font-bold text-xs border-gray-100 hover:bg-blue-50 hover:text-blue-600 group-hover:border-blue-100">
                      Manage Roster
                    </Button>
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        </TabsContent>

        <TabsContent value="inventory" className="space-y-6">
          <div className="bg-white rounded-2xl shadow-sm border border-gray-50 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="py-4 px-6 text-[10px] font-bold uppercase text-gray-400">Equipment Name</th>
                    <th className="py-4 px-6 text-[10px] font-bold uppercase text-gray-400 text-center">In Stock</th>
                    <th className="py-4 px-6 text-[10px] font-bold uppercase text-gray-400 text-center">Min Stock</th>
                    <th className="py-4 px-6 text-[10px] font-bold uppercase text-gray-400">Status</th>
                    <th className="py-4 px-6 text-[10px] font-bold uppercase text-gray-400 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {inventory.length === 0 ? (
                    <tr><td colSpan={5} className="py-10 text-center text-sm font-bold text-gray-400">No sports equipment found.</td></tr>
                  ) : (
                    inventory.map((item: any) => (
                      <tr key={item.id} className="hover:bg-gray-50/50 transition-colors">
                        <td className="py-4 px-6">
                          <p className="font-bold text-sm text-gray-900">{item.name}</p>
                          <p className="text-[10px] font-medium text-gray-400">Unit: {item.unit || 'pcs'}</p>
                        </td>
                        <td className="py-4 px-6 text-center font-bold text-sm text-gray-900">{item.quantity}</td>
                        <td className="py-4 px-6 text-center font-medium text-sm text-gray-500">{item.min_stock || 0}</td>
                        <td className="py-4 px-6">
                          <Badge className={`text-[10px] font-bold border-none px-2 py-0.5 rounded-full ${
                            item.quantity <= (item.min_stock || 10) ? 'bg-amber-50 text-amber-700' : 'bg-emerald-50 text-emerald-700'
                          }`}>
                            {item.quantity <= (item.min_stock || 10) ? 'Low Stock' : 'Good'}
                          </Badge>
                        </td>
                        <td className="py-4 px-6 text-right">
                          <Button variant="ghost" size="sm" className="h-8 rounded-lg font-bold text-[10px] text-blue-600 hover:bg-blue-50">Refill</Button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="competitions" className="space-y-6">
           <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {competitions.length === 0 ? (
              <div className="col-span-full py-20 text-center bg-white rounded-2xl shadow-sm border border-dashed border-gray-200">
                <Trophy className="w-12 h-12 text-gray-200 mx-auto mb-3" />
                <p className="text-sm font-bold text-gray-400">No matches or tournaments scheduled.</p>
              </div>
            ) : (
              competitions.map((comp: any) => (
                <Card key={comp.id} className="border-none shadow-sm bg-white overflow-hidden hover:shadow-md transition-all">
                  <CardContent className="p-6">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="font-bold text-gray-900">{comp.title}</h3>
                      <Badge className="bg-blue-600 text-white text-[10px] font-bold border-none">{comp.status}</Badge>
                    </div>
                    <div className="space-y-2">
                       <div className="flex items-center gap-2 text-xs font-medium text-gray-500">
                        <Calendar className="w-3.5 h-3.5 text-blue-500" /> {comp.date}
                      </div>
                      <div className="flex items-center gap-2 text-xs font-medium text-gray-500">
                        <Trophy className="w-3.5 h-3.5 text-amber-500" /> {comp.prize || 'No prize specified'}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
           </div>
        </TabsContent>
      </Tabs>

      <SportsTeamModal 
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSuccess={fetchSportsData}
        team={selectedTeam}
      />
    </div>
  );
}
