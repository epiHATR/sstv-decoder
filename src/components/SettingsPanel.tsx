'use client';

import { useEffect, useState } from 'react';
import Fab from '@mui/material/Fab';
import SettingsIcon from '@mui/icons-material/Settings';
import ThemeToggle from '@/components/ThemeToggle';
import { useCompactActions } from '@/hooks/useCompactActions';
import { CompactActionButton } from '@/components/CompactActionButton';
import { IconClose } from '@/components/action-icons';

export type SSTVMode = 'ROBOT36' | 'ROBOT72' | 'SCOTTIE_S1' | 'SCOTTIE_S2' | 'PD120' | 'PD160' | 'PD180';

interface SettingsPanelProps {
  currentMode: SSTVMode;
  onModeChange: (mode: SSTVMode) => void;
  disabled?: boolean;
  /** When set with `onSettingsOpenChange`, modal open state is controlled by parent (e.g. header gear). */
  settingsOpen?: boolean;
  onSettingsOpenChange?: (open: boolean) => void;
  /** Hide bottom-right FAB + theme (parent provides header controls). */
  hideFloatingChrome?: boolean;
}

export default function SettingsPanel({
  currentMode,
  onModeChange,
  disabled = false,
  settingsOpen: controlledOpen,
  onSettingsOpenChange,
  hideFloatingChrome = false,
}: SettingsPanelProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  const compact = useCompactActions();

  const controlled = controlledOpen !== undefined && onSettingsOpenChange !== undefined;
  const isOpen = controlled ? controlledOpen : internalOpen;
  const setOpen = (open: boolean) => {
    if (controlled) {
      onSettingsOpenChange(open);
    } else {
      setInternalOpen(open);
    }
  };

  useEffect(() => {
    if (hideFloatingChrome && !controlled) {
      console.warn('SettingsPanel: hideFloatingChrome is set but modal is not controlled; open the modal from the parent.');
    }
  }, [hideFloatingChrome, controlled]);

  const modes: { id: SSTVMode; name: string; description: string }[] = [
    {
      id: 'ROBOT36',
      name: 'Robot 36',
      description: '320×240 • Fast mode (150ms/line) • Interlaced YUV',
    },
    {
      id: 'ROBOT72',
      name: 'Robot 72',
      description: '320×240 • Better color (300ms/line) • Sequential YUV',
    },
    {
      id: 'SCOTTIE_S1',
      name: 'Scottie S1',
      description: '320×256 • HF classic (428ms/line) • RGB sequential',
    },
    {
      id: 'SCOTTIE_S2',
      name: 'Scottie S2',
      description: '320×256 • Faster HF (278ms/line) • RGB sequential',
    },
    {
      id: 'PD120',
      name: 'PD 120',
      description: '640×496 • High resolution (508ms/line) • Dual-luminance',
    },
    {
      id: 'PD160',
      name: 'PD 160',
      description: '512×400 • Balanced mode (804ms/line) • Dual-luminance',
    },
    {
      id: 'PD180',
      name: 'PD 180',
      description: '640×496 • Highest quality (752ms/line) • Dual-luminance',
    },
  ];

  return (
    <>
      {!hideFloatingChrome && (
        <div className="fixed bottom-6 right-6 z-40 flex flex-row-reverse items-end gap-3">
          <Fab
            color="primary"
            aria-label="settings"
            onClick={() => setOpen(true)}
            disabled={disabled}
            sx={{
              backgroundColor: '#238636',
              '&:hover': {
                backgroundColor: '#2ea043',
              },
              '&.Mui-disabled': {
                backgroundColor: 'var(--surface-button)',
                opacity: 0.5,
              },
            }}
          >
            <SettingsIcon />
          </Fab>
          <ThemeToggle />
        </div>
      )}

      {isOpen && (
        <div
          className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4"
          onClick={() => setOpen(false)}
        >
          <div
            className="bg-surface border border-border rounded-lg max-w-lg w-full shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-4 sm:p-6 border-b border-border">
              <h2 className="text-xl sm:text-2xl font-semibold text-foreground">Settings</h2>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="text-muted hover:text-foreground transition-colors"
                aria-label="Close"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-6 w-6"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="p-4 sm:p-6 space-y-4 max-h-[60vh] overflow-y-auto">
              <div>
                <h3 className="text-sm font-semibold text-muted uppercase tracking-wide mb-3">
                  SSTV Mode
                </h3>
                <div className="space-y-2">
                  {modes.map((mode) => (
                    <button
                      key={mode.id}
                      type="button"
                      onClick={() => {
                        onModeChange(mode.id);
                        setOpen(false);
                      }}
                      className={`w-full text-left p-4 rounded-lg border-2 transition-all ${
                        currentMode === mode.id
                          ? 'border-primary bg-accent-muted'
                          : 'border-border bg-surface-inset hover:border-muted'
                      }`}
                    >
                      <div className="flex items-start justify-between">
                        <div>
                          <div className="font-semibold text-foreground mb-1">{mode.name}</div>
                          {!compact && (
                            <div className="text-sm text-muted">{mode.description}</div>
                          )}
                        </div>
                        {currentMode === mode.id && (
                          <svg
                            xmlns="http://www.w3.org/2000/svg"
                            className="h-5 w-5 text-primary flex-shrink-0 mt-0.5"
                            viewBox="0 0 20 20"
                            fill="currentColor"
                          >
                            <path
                              fillRule="evenodd"
                              d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                              clipRule="evenodd"
                            />
                          </svg>
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              <div className="bg-surface-inset border border-border rounded-lg p-4">
                <div className="flex gap-3">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="h-5 w-5 text-info flex-shrink-0 mt-0.5"
                    viewBox="0 0 20 20"
                    fill="currentColor"
                  >
                    <path
                      fillRule="evenodd"
                      d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
                      clipRule="evenodd"
                    />
                  </svg>
                  <div className="text-sm text-muted">
                    <p>
                      <strong className="text-foreground">Note:</strong> Changing modes will reset the
                      current decoding session. Make sure to save your image before switching.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div className="p-4 sm:p-6 border-t border-border flex justify-end">
              <CompactActionButton
                variant="primary"
                icon={<IconClose className="h-5 w-5" />}
                label="Close"
                onClick={() => setOpen(false)}
                layout="inline"
              />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
