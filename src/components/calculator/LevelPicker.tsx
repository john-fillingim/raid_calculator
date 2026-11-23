import * as Select from '@radix-ui/react-select';
import { LEVELS, type RaidLevel } from '../../lib/raid';

const GROUPS: { label: string; levels: RaidLevel[] }[] = [
  { label: 'Common', levels: ['raid0', 'raid1', 'raid5', 'raid6', 'raid10'] },
  { label: 'Nested', levels: ['raid50', 'raid60'] },
  { label: 'ZFS', levels: ['raidz1', 'raidz2', 'raidz3'] },
  { label: 'Extended', levels: ['raid1e', 'raid5e', 'raid5ee', 'jbod'] },
];

type Props = { value: RaidLevel; onChange: (level: RaidLevel) => void; id?: string };

export function LevelPicker({ value, onChange, id }: Props) {
  const current = LEVELS[value];
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm text-text-2">
        RAID level
      </label>
      <Select.Root value={value} onValueChange={(v) => onChange(v as RaidLevel)}>
        <Select.Trigger
          id={id}
          className="group flex min-h-14 w-full items-center gap-3 rounded-md border border-border-strong bg-surface px-3.5 py-2 text-left transition-colors duration-150 hover:border-text-3 focus-visible:border-accent data-[state=open]:border-accent"
          aria-label={`RAID level: ${current.name}`}
        >
          <span className="min-w-0 flex-1">
            <span className="block text-[15px] font-semibold text-text">
              <Select.Value>{current.name}</Select.Value>
            </span>
            <span className="block truncate text-xs text-text-3">{current.tagline}</span>
          </span>
          <Select.Icon className="text-text-3 transition-transform duration-150 group-data-[state=open]:rotate-180">
            <Chevron />
          </Select.Icon>
        </Select.Trigger>
        <Select.Portal>
          <Select.Content
            position="popper"
            sideOffset={6}
            collisionPadding={12}
            className="z-50 max-h-[min(70vh,var(--radix-select-content-available-height))] w-[var(--radix-select-trigger-width)] min-w-[300px] overflow-hidden rounded-lg border border-border-strong bg-surface shadow-md"
          >
            <Select.Viewport className="p-1.5">
              {GROUPS.map((group, gi) => (
                <Select.Group key={group.label}>
                  {gi > 0 && <Select.Separator className="my-1.5 h-px bg-border" />}
                  <Select.Label className="px-2.5 pt-1.5 pb-1 text-[11px] font-medium tracking-wide text-text-3 uppercase">
                    {group.label}
                  </Select.Label>
                  {group.levels.map((id) => {
                    const def = LEVELS[id];
                    return (
                      <Select.Item
                        key={id}
                        value={id}
                        className="relative flex cursor-default flex-col rounded-md py-2 pr-8 pl-2.5 outline-none select-none data-[highlighted]:bg-surface-2 data-[state=checked]:bg-accent-soft"
                      >
                        <Select.ItemText>
                          <span className="text-sm font-medium text-text">{def.name}</span>
                        </Select.ItemText>
                        <span className="text-xs text-text-3">{def.tagline}</span>
                        <Select.ItemIndicator className="absolute top-1/2 right-2.5 -translate-y-1/2 text-accent-text">
                          <Check />
                        </Select.ItemIndicator>
                      </Select.Item>
                    );
                  })}
                </Select.Group>
              ))}
            </Select.Viewport>
          </Select.Content>
        </Select.Portal>
      </Select.Root>
    </div>
  );
}

function Chevron() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M4 6l4 4 4-4"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function Check() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M3.5 8.5l3 3 6-7"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
