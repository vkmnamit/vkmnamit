import React from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Label } from './ui/label';

interface StudentSortFilterProps {
  value: string;
  onChange: (v: string) => void;
  showLabel?: boolean;
}

export function StudentSortFilter({ value, onChange, showLabel = true }: StudentSortFilterProps) {
  return (
    <div className="flex-1 min-w-[180px]">
      {showLabel && <Label className="text-[10px] font-bold uppercase text-gray-400 block mb-1.5">Sort By</Label>}
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="w-full h-10 rounded-xl bg-white border-gray-200">
          <SelectValue placeholder="Sort By" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="roll_asc">Roll No (Low to High)</SelectItem>
          <SelectItem value="roll_desc">Roll No (High to Low)</SelectItem>
          <SelectItem value="name_asc">Name (A-Z)</SelectItem>
          <SelectItem value="added_newest">Date Added (Newest)</SelectItem>
          <SelectItem value="added_oldest">Date Added (Oldest)</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}

export function sortStudentsArray(students: any[], sortMode: string) {
  if (!students || !Array.isArray(students)) return [];
  
  return [...students].sort((left: any, right: any) => {
    if (sortMode === 'name_asc') {
      const leftName = `${left.user?.first_name || left.name || ''} ${left.user?.last_name || ''}`.trim();
      const rightName = `${right.user?.first_name || right.name || ''} ${right.user?.last_name || ''}`.trim();
      return leftName.localeCompare(rightName);
    }
    if (sortMode === 'added_newest') {
      const leftTime = new Date(left.created_at || left.admission_date || 0).getTime();
      const rightTime = new Date(right.created_at || right.admission_date || 0).getTime();
      return rightTime - leftTime;
    }
    if (sortMode === 'added_oldest') {
      const leftTime = new Date(left.created_at || left.admission_date || 0).getTime();
      const rightTime = new Date(right.created_at || right.admission_date || 0).getTime();
      return leftTime - rightTime;
    }
    
    // Default to roll_asc / roll_desc
    // Handle null/undefined roll numbers carefully so they sort at the bottom
    const leftRoll = left.roll_number != null && left.roll_number !== '' && !isNaN(Number(left.roll_number)) ? Number(left.roll_number) : Number.MAX_SAFE_INTEGER;
    const rightRoll = right.roll_number != null && right.roll_number !== '' && !isNaN(Number(right.roll_number)) ? Number(right.roll_number) : Number.MAX_SAFE_INTEGER;
    const rollDifference = leftRoll - rightRoll;
    return sortMode === 'roll_desc' ? -rollDifference : rollDifference;
  });
}
