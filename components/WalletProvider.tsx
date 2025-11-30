"use client";

import { ReactNode, useEffect } from 'react';
import { isWalletInstalled } from '@/lib/walletService';

interface WalletProviderProps {
  children: ReactNode;
}

/**
 * Wallet Provider - Lightweight provider that just ensures wallet state syncs
 * TopBar component handles the actual wallet connection and saves to localStorage
 * This provider just ensures localStorage is checked on mount
 */
export function WalletProvider({ children }: WalletProviderProps) {
  useEffect(() => {
    // Only run on client side
    if (typeof window === 'undefined') return;

    // Simple check: if wallet is installed and we have a saved address, keep it
    // The actual wallet connection is handled by TopBar component
    // This provider just ensures the app doesn't hang waiting for wallet
    
    // Check if we have a saved address
    const savedAddress = localStorage.getItem('walletAddress');
    if (!savedAddress && isWalletInstalled()) {
      // Try to get account once on mount (non-blocking)
      // Use setTimeout to avoid blocking initial render
      setTimeout(async () => {
        try {
          if (window.aptos) {
            const account = await window.aptos.account();
            if (account?.address) {
              localStorage.setItem('walletAddress', account.address);
            }
          }
        } catch (error) {
          // Silently fail - wallet might not be connected
        }
      }, 1000); // Wait 1 second after mount
    }
  }, []);

  return <>{children}</>;
}
