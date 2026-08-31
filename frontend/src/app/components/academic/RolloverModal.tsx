import { useState } from 'react';
import { api } from '../../../lib/api';
import { toast } from 'sonner';
import { GraduationCap, Download, AlertTriangle, CheckCircle2, Loader2 } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '../../components/ui/dialog';
import { Button } from '../../components/ui/button';
import { Label } from '../../components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import { Input } from '../../components/ui/input';
import { Badge } from '../../components/ui/badge';

interface AcademicYear {
    id: string;
    name: string;
    is_current: boolean;
}

interface RolloverPreview {
    summary: {
        totalStudents: number;
        willPromote: number;
        willPassOut: number;
        classesNeedingCreation: number;
        feeStructuresToCopy: number;
        existingToYearFees: number;
    };
    classPreview: Array<{
        className: string;
        studentCount: number;
        action: string;
        nextClassName?: string | null;
    }>;
}

interface Props {
    open: boolean;
    onClose: () => void;
    academicYears: AcademicYear[];
    currentYear: AcademicYear | null;
    onRolloverComplete: () => void;
    editMode?: boolean;
    editData?: {
        id: string;
        from_academic_year_id: string;
        to_academic_year_id: string;
        fee_increase_percent: number;
    };
}

export function RolloverModal({ open, onClose, academicYears, currentYear, onRolloverComplete, editMode = false, editData }: Props) {
    const [fromYearId, setFromYearId] = useState(editData?.from_academic_year_id || currentYear?.id || '');
    const [toYearId, setToYearId] = useState(editData?.to_academic_year_id || '');
    const [feeIncrease, setFeeIncrease] = useState(editData?.fee_increase_percent?.toString() || '0');
    const [preview, setPreview] = useState<RolloverPreview | null>(null);
    const [loading, setLoading] = useState(false);
    const [executing, setExecuting] = useState(false);
    const [rolloverId, setRolloverId] = useState<string | null>(null);
    const [rolloverStatus, setRolloverStatus] = useState<any>(null);

    const fromYear = academicYears.find(y => y.id === fromYearId);
    const toYear = academicYears.find(y => y.id === toYearId);

    const loadPreview = async () => {
        if (!fromYearId || !toYearId) {
            toast.error('Select both academic years');
            return;
        }
        setLoading(true);
        try {
            const data = await api.getRolloverPreview(fromYearId, toYearId);
            setPreview(data);
        } catch (err: any) {
            toast.error(err?.message || 'Failed to load preview');
        } finally {
            setLoading(false);
        }
    };

    const executeRollover = async () => {
        if (!fromYearId || !toYearId) return;
        setExecuting(true);
        try {
            const res = await api.executeRollover({
                fromAcademicYearId: fromYearId,
                toAcademicYearId: toYearId,
                feeIncreasePercent: Number(feeIncrease) || 0,
                copyFeeStructures: true,
                copyTransport: true,
                promoteStudents: true,
            });
            setPreview(null);
            setRolloverId(res.rolloverId || null);

            // Poll for status (background job for large datasets)
            if (res.rolloverId) {
                pollRolloverStatus(res.rolloverId);
            } else {
                onRolloverComplete();
                onClose();
                toast.success(res.message || 'Rollover completed!');
            }
        } catch (err: any) {
            toast.error(err?.message || 'Rollover failed');
            setExecuting(false);
        }
    };

    const pollRolloverStatus = async (id: string) => {
        const maxAttempts = 60; // 2 minutes max
        let attempts = 0;
        const interval = setInterval(async () => {
            attempts++;
            try {
                const status = await api.getRolloverStatus(id);
                setRolloverStatus(status);
                if (status.status === 'completed' || status.status === 'failed') {
                    clearInterval(interval);
                    setExecuting(false);
                    setRolloverId(null);
                    if (status.status === 'completed') {
                        onRolloverComplete();
                        onClose();
                        toast.success('Rollover completed!', {
                            description: `${status.students_promoted || 0} promoted | ${status.students_passed_out || 0} passed out | ${status.fee_structures_copied || 0} fees copied`,
                        });
                    } else {
                        toast.error(`Rollover failed: ${status.error_message || 'Unknown error'}`);
                    }
                    setRolloverStatus(null);
                } else if (attempts >= maxAttempts) {
                    clearInterval(interval);
                    setExecuting(false);
                    toast.info('Rollover is still running in the background. Check Rollover Logs for updates.');
                }
            } catch (err: any) {
                console.warn('Polling error:', err.message);
            }
        }, 2000);
    };

    const reset = () => {
        setFromYearId(editMode && editData ? editData.from_academic_year_id : (currentYear?.id || ''));
        setToYearId(editMode && editData ? editData.to_academic_year_id : '');
        setFeeIncrease(editMode && editData ? editData.fee_increase_percent?.toString() || '0' : '0');
        setPreview(null);
    };

    return (
        <Dialog open={open} onOpenChange={(o) => { if (!o) { reset(); onClose(); } }}>
            <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <GraduationCap className="h-5 w-5" />
                        {editMode ? 'Edit Rollover' : 'Academic Year Rollover'}
                    </DialogTitle>
                    <DialogDescription>
                        {editMode ? 'Update rollover settings and re-execute.' : 'Promote all students to next class, handle senior batch, and copy fee structures to the new academic year.'}
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-4 py-2">
                    {/* Year selection */}
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label>From Academic Year</Label>
                            <Select value={fromYearId} onValueChange={setFromYearId}>
                                <SelectTrigger><SelectValue placeholder="Select year">{fromYear?.name}</SelectValue></SelectTrigger>
                                <SelectContent>
                                    {academicYears.map(y => (
                                        <SelectItem key={y.id} value={y.id}>{y.name}{y.is_current ? ' (Current)' : ''}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-2">
                            <Label>To New Academic Year</Label>
                            <Select value={toYearId} onValueChange={setToYearId}>
                                <SelectTrigger><SelectValue placeholder="Select year">{toYear?.name}</SelectValue></SelectTrigger>
                                <SelectContent>
                                    {academicYears.filter(y => y.id !== fromYearId).map(y => (
                                        <SelectItem key={y.id} value={y.id}>{y.name}{y.is_current ? ' (Current)' : ''}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    </div>

                    {/* Fee increase */}
                    <div className="space-y-2">
                        <Label>Fee Increase % (0 = same fees)</Label>
                        <Input
                            type="number"
                            min="0"
                            value={feeIncrease}
                            onChange={(e) => setFeeIncrease(e.target.value)}
                            placeholder="e.g. 10 for +10%"
                        />
                    </div>

                    <Button onClick={loadPreview} disabled={!fromYearId || !toYearId || loading} className="w-full">
                        {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Download className="h-4 w-4 mr-2" />}
                        Preview Rollover
                    </Button>

                    {/* Preview summary */}
                    {preview && (
                        <div className="space-y-4 border rounded-lg p-4 bg-muted/30">
                            <div className="grid grid-cols-2 gap-2 text-sm">
                                <div className="flex justify-between"><span>Total Students:</span><b>{preview.summary.totalStudents}</b></div>
                                <div className="flex justify-between"><span>Will Promote:</span><b className="text-green-600">{preview.summary.willPromote}</b></div>
                                <div className="flex justify-between"><span>Will Pass Out:</span><b className="text-amber-600">{preview.summary.willPassOut}</b></div>
                                <div className="flex justify-between"><span>Fees to Copy:</span><b>{preview.summary.feeStructuresToCopy}</b></div>
                                <div className="flex justify-between"><span>Need Class Creation:</span><b className="text-red-600">{preview.summary.classesNeedingCreation}</b></div>
                                <div className="flex justify-between"><span>Existing To-Year Fees:</span><b>{preview.summary.existingToYearFees}</b></div>
                            </div>

                            {preview.summary.classesNeedingCreation > 0 && (
                                <div className="flex gap-2 items-center text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded p-2">
                                    <AlertTriangle className="h-4 w-4" />
                                    Some classes don't exist in the new year yet. Create them in Classes before executing, or students in those classes will stay.
                                </div>
                            )}

                            {/* Class-by-class preview */}
                            <div className="space-y-1 max-h-40 overflow-y-auto">
                                {preview.classPreview.map(c => (
                                    <div key={c.className} className="flex justify-between text-xs border rounded px-2 py-1 bg-background">
                                        <span>{c.className} <b>({c.studentCount} students)</b></span>
                                        <Badge variant={c.action === 'passed_out' ? 'destructive' : c.action === 'promoted' ? 'default' : 'secondary'}>
                                            {c.action === 'passed_out' ? `Passed Out → ${c.nextClassName || 'Alumni'}` : c.action === 'promoted' ? `→ ${c.nextClassName}` : 'Needs Class'}
                                        </Badge>
                                    </div>
                                ))}
                            </div>

                            <div className="flex gap-2 items-center text-xs text-blue-600 bg-blue-50 border border-blue-200 rounded p-2">
                                <CheckCircle2 className="h-4 w-4" />
                                Fee structures will be copied with {Number(feeIncrease) > 0 ? `+${feeIncrease}% increase` : 'same amounts'}. Transport assignments carried over. Senior batch (Class 10/12) marked as passed out / alumni.
                            </div>
                        </div>
                    )}
                </div>

                {/* Live status for background rollover */}
                {rolloverId && rolloverStatus && (
                    <div className="border rounded-lg p-3 bg-muted/30 text-sm">
                        <div className="flex items-center gap-2 mb-2">
                            <Loader2 className="h-4 w-4 animate-spin" />
                            <b>Rollover in progress...</b>
                        </div>
                        <div className="grid grid-cols-2 gap-1 text-xs">
                            <div>Promoted: <b>{rolloverStatus.students_promoted || 0}</b></div>
                            <div>Passed Out: <b>{rolloverStatus.students_passed_out || 0}</b></div>
                            <div>Fees Copied: <b>{rolloverStatus.fee_structures_copied || 0}</b></div>
                            <div>Status: <b>{rolloverStatus.status}</b></div>
                        </div>
                    </div>
                )}

                <DialogFooter className="gap-2">
                    <Button variant="outline" onClick={() => { reset(); onClose(); }} disabled={executing}>Cancel</Button>
                    <Button onClick={executeRollover} disabled={!preview || executing}>
                        {executing ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <GraduationCap className="h-4 w-4 mr-2" />}
                        {rolloverId ? 'Running...' : (editMode ? 'Update Rollover' : 'Execute Rollover')}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}