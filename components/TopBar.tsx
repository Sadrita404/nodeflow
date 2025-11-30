"use client";

import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  Save,
  Upload,
  Download,
  Settings,
  FolderPlus,
  Network,
  Wallet,
  ChevronDown,
  LogOut
} from 'lucide-react';
import { useWorkflowStore } from '@/store/workflowStore';
import AddNetworkModal from './AddNetworkModal';
import NewProjectModal from './NewProjectModal';
import { toast } from 'react-toastify';
import { 
  connectWallet, 
  disconnectWallet as disconnectWalletService, 
  getCurrentAccount,
  setupWalletListeners,
  formatAddress as formatWalletAddress,
  isWalletInstalled,
  WalletAccount
} from '@/lib/walletService';

export default function TopBar() {
  const {
    currentProject,
    selectedNetwork,
    networks,
    setSelectedNetwork,
  } = useWorkflowStore();

  const [showNetworkMenu, setShowNetworkMenu] = useState(false);
  const [showAddNetworkModal, setShowAddNetworkModal] = useState(false);
  const [showNewProjectModal, setShowNewProjectModal] = useState(false);
  const [walletConnected, setWalletConnected] = useState(false);
  const [walletAddress, setWalletAddress] = useState('');

  // Check wallet connection on mount and setup listeners
  useEffect(() => {
    checkWalletConnection();
    
    const cleanup = setupWalletListeners(
      (account) => {
        if (account) {
          setWalletAddress(account.address);
          setWalletConnected(true);
          localStorage.setItem('walletAddress', account.address);
        } else {
          handleDisconnect();
        }
      },
      () => {
        handleDisconnect();
      }
    );

    return cleanup;
  }, []);

  const checkWalletConnection = async () => {
    try {
      // Only check if wallet is actually installed
      if (!isWalletInstalled()) {
        setWalletConnected(false);
        setWalletAddress('');
        return;
      }

      // Try to get account directly from wallet (most reliable)
      if (window.aptos) {
        try {
          const account = await window.aptos.account();
          if (account && account.address) {
            setWalletAddress(account.address);
            setWalletConnected(true);
            localStorage.setItem('walletAddress', account.address);
            return;
          }
        } catch (error) {
          // If account() fails, wallet is not connected
          setWalletConnected(false);
          setWalletAddress('');
          localStorage.removeItem('walletAddress');
          return;
        }
      }

      // Fallback: check localStorage (but don't set as connected)
      const savedAddress = localStorage.getItem('walletAddress');
      if (savedAddress) {
        // Only show address if wallet is installed (might be stale)
        if (isWalletInstalled()) {
          setWalletAddress(savedAddress);
          // Don't set as connected - user needs to reconnect
          setWalletConnected(false);
        } else {
          localStorage.removeItem('walletAddress');
        }
      }
    } catch (error) {
      console.error('Error checking wallet connection:', error);
      setWalletConnected(false);
      setWalletAddress('');
    }
  };

  const handleConnectWallet = async () => {
    if (!isWalletInstalled()) {
      toast.error('Please install Petra wallet to use this feature!');
      window.open('https://petra.app/', '_blank');
      return;
    }

    // Reset state before attempting connection
    setWalletConnected(false);
    setWalletAddress('');

    try {
      const account = await connectWallet();
      if (account && account.address) {
        setWalletAddress(account.address);
        setWalletConnected(true);
        toast.success('Wallet connected successfully!');
      } else {
        throw new Error('Failed to get account from wallet');
      }
    } catch (error: any) {
      console.error('Failed to connect wallet:', error);
      // Ensure state is reset on error
      setWalletConnected(false);
      setWalletAddress('');
      localStorage.removeItem('walletAddress');
      
      // Show user-friendly error message
      const errorMessage = error.message || 'Failed to connect wallet';
      toast.error(errorMessage);
    }
  };

  const handleDisconnect = () => {
    setWalletAddress('');
    setWalletConnected(false);
    localStorage.removeItem('walletAddress');
  };

  const disconnectWallet = async () => {
    try {
      await disconnectWalletService();
      handleDisconnect();
      toast.info('Wallet disconnected');
    } catch (error) {
      console.error('Error disconnecting wallet:', error);
    }
  };

  const handleNetworkSelect = async (network: typeof networks[0]) => {
    setSelectedNetwork(network);
    setShowNetworkMenu(false);
    toast.success(`Selected ${network.name}`);
  };


  return (
    <>
      <div className="h-16 bg-white border-b border-gray-200 flex items-center justify-between px-6 shadow-sm">
        {/* Left Section - Project Info */}
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg flex items-center justify-center">
              <img src="/logo.svg" alt="NodeFlow Logo" className="w-10 h-10" />
            </div>
            <div>
              <h1 className="text-sm font-semibold text-gray-800">
                {currentProject?.title || 'NodeFlow'}
              </h1>
              {currentProject?.description && (
                <p className="text-xs text-gray-500">
                  {currentProject.description}
                </p>
              )}
            </div>
          </div>

          <div className="h-8 w-px bg-gray-200" />

          <button
            onClick={() => setShowNewProjectModal(true)}
            className="flex items-center gap-2 px-3 py-2 text-sm text-gray-600 hover:text-primary hover:bg-gray-50 rounded-lg transition-all duration-200"
          >
            <FolderPlus className="w-4 h-4" />
            <span>New Project</span>
          </button>
        </div>

        {/* Center Section - Network Selector */}
        <div className="flex items-center gap-4">
          <div className="relative">
            <button
              onClick={() => setShowNetworkMenu(!showNetworkMenu)}
              className="flex items-center gap-2 px-4 py-2 bg-gray-50 border border-gray-200 rounded-lg hover:border-secondary transition-all duration-200"
            >
              <Network className="w-4 h-4 text-secondary" />
              <span className="text-sm font-medium text-gray-700">
                {selectedNetwork?.name || 'Select Network'}
              </span>
              {walletConnected && (
                <div className="w-2 h-2 rounded-full bg-green-500" title="Connected" />
              )}
              <ChevronDown className="w-4 h-4 text-gray-500" />
            </button>

            {showNetworkMenu && (
              <>
                <div
                  className="fixed inset-0 z-10"
                  onClick={() => setShowNetworkMenu(false)}
                />
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="absolute top-full mt-2 left-0 w-64 bg-white border border-gray-200 rounded-lg shadow-lg z-20 overflow-hidden"
                >
                  <div className="p-2 bg-gray-50 border-b border-gray-200">
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider px-2">
                      Select Network
                    </p>
                  </div>
                  <div className="max-h-80 overflow-y-auto">
                    {networks.map((network) => (
                      <button
                        key={network.id}
                        onClick={() => handleNetworkSelect(network)}
                        className={`w-full px-4 py-3 text-left hover:bg-gray-50 transition-colors flex items-center justify-between ${
                          selectedNetwork?.id === network.id ? 'bg-secondary bg-opacity-10' : ''
                        }`}
                      >
                        <div>
                          <div className="text-sm font-medium text-gray-800 flex items-center gap-2">
                            {network.name}
                            {walletConnected && (
                              <div className="w-2 h-2 rounded-full bg-green-500" title="Connected" />
                            )}
                          </div>
                          <div className="text-xs text-gray-500">
                            {network.symbol}
                          </div>
                        </div>
                        {selectedNetwork?.id === network.id && (
                          <div className="w-2 h-2 rounded-full bg-secondary" />
                        )}
                      </button>
                    ))}
                  </div>
                </motion.div>
              </>
            )}
          </div>

          {walletConnected ? (
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-2 px-4 py-2 bg-green-50 border border-green-200 rounded-lg">
                <div className="w-2 h-2 rounded-full bg-green-500" />
                <span className="text-sm font-medium text-green-700">
                  {formatWalletAddress(walletAddress)}
                </span>
              </div>
              <button
                onClick={disconnectWallet}
                className="p-2 text-gray-600 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all duration-200"
                title="Disconnect Wallet"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <button
              onClick={handleConnectWallet}
              className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg hover:bg-opacity-90 transition-all duration-200"
            >
              <Wallet className="w-4 h-4" />
              <span className="text-sm font-medium">Connect Wallet</span>
            </button>
          )}
        </div>

        {/* Right Section - Actions */}
        <div className="flex items-center gap-2">
          <button
            className="p-2 text-gray-600 hover:text-primary hover:bg-gray-50 rounded-lg transition-all duration-200"
            title="Save Project"
          >
            <Save className="w-5 h-5" />
          </button>
          <button
            className="p-2 text-gray-600 hover:text-primary hover:bg-gray-50 rounded-lg transition-all duration-200"
            title="Import Workflow"
          >
            <Upload className="w-5 h-5" />
          </button>
          <button
            className="p-2 text-gray-600 hover:text-primary hover:bg-gray-50 rounded-lg transition-all duration-200"
            title="Export Workflow"
          >
            <Download className="w-5 h-5" />
          </button>
          <div className="h-8 w-px bg-gray-200 mx-2" />
          <button
            className="p-2 text-gray-600 hover:text-primary hover:bg-gray-50 rounded-lg transition-all duration-200"
            title="Settings"
          >
            <Settings className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Modals */}
      <AddNetworkModal
        isOpen={showAddNetworkModal}
        onClose={() => setShowAddNetworkModal(false)}
      />

      <NewProjectModal
        isOpen={showNewProjectModal}
        onClose={() => setShowNewProjectModal(false)}
      />
    </>
  );
}
