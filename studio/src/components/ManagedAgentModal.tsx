'use client';

import type {
  DecisionsScorecard,
  DesignManifest,
  GitHubPrResponse,
} from '@shared/types';
import { NativeDialog } from './NativeDialog';
import { ManagedAgentPanel } from './ManagedAgentPanel';

export { ManagedAgentPanel };

interface ManagedAgentModalProps {
  open: boolean;
  onClose: () => void;
  defaultRepoUrl?: string;
  defaultBranch?: string;
  manifest?: DesignManifest;
  scorecard?: DecisionsScorecard;
  lastPr: GitHubPrResponse | null;
  openingPr: boolean;
  onOpenPr: () => void;
}

export function ManagedAgentModal({
  open,
  onClose,
  defaultRepoUrl,
  defaultBranch,
  manifest,
  scorecard,
  lastPr,
  openingPr,
  onOpenPr,
}: ManagedAgentModalProps) {
  return (
    <NativeDialog
      open={open}
      onClose={onClose}
      title="Ship via Antigravity Managed Agent"
      subtitle="antigravity-preview-09-2026 · Remote Linux Sandbox + Build Verification Gate"
      widthClass="w-[min(96vw,1040px)]"
    >
      <div className="-m-5">
        <ManagedAgentPanel
          defaultRepoUrl={defaultRepoUrl}
          defaultBranch={defaultBranch}
          manifest={manifest}
          scorecard={scorecard}
          lastPr={lastPr}
          openingPr={openingPr}
          onOpenPr={onOpenPr}
        />
      </div>
    </NativeDialog>
  );
}
