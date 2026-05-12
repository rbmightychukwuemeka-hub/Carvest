import React, { useState } from 'react';
import { 
  adminGetDashboardStats, 
  adminGetPendingDeposits,
  adminApproveDeposit,
  adminRejectDeposit 
} from 'wasp/client/operations';
import { useQuery } from 'wasp/client/operations';

export default function AdminPanelPage() {
  const { data: stats } = useQuery(adminGetDashboardStats);
  const { data: pendingDeposits } = useQuery(adminGetPendingDeposits);
  const [processingId, setProcessingId] = useState<number | null>(null);
  const [message, setMessage] = useState('');

  const handleApprove = async (transactionId: number) => {
    setProcessingId(transactionId);
    setMessage('');
    try {
      await adminApproveDeposit({ transactionId });
      setMessage('Deposit approved successfully!');
      setTimeout(() => setMessage(''), 3000);
    } catch (err: any) {
      setMessage(err.message || 'Failed to approve deposit');
    } finally {
      setProcessingId(null);
    }
  };

  const handleReject = async (transactionId: number) => {
    setProcessingId(transactionId);
    setMessage('');
    try {
      await adminRejectDeposit({ transactionId, adminNote: 'Rejected by admin' });
      setMessage('Deposit rejected successfully!');
      setTimeout(() => setMessage(''), 3000);
    } catch (err: any) {
      setMessage(err.message || 'Failed to reject deposit');
    } finally {
      setProcessingId(null);
    }
  };

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">Admin Panel</h1>

      {message && (
        <div className={`p-4 rounded ${message.includes('success') ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
          {message}
        </div>
      )}

      {/* Dashboard Stats */}
      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-blue-50 p-6 rounded-lg border border-blue-200">
            <p className="text-gray-600 text-sm">Total Users</p>
            <p className="text-2xl font-bold text-blue-600">{stats.totalUsers}</p>
          </div>
          
          <div className="bg-green-50 p-6 rounded-lg border border-green-200">
            <p className="text-gray-600 text-sm">Total Deposits</p>
            <p className="text-2xl font-bold text-green-600">₦{stats.totalDeposits.toLocaleString()}</p>
          </div>

          <div className="bg-orange-50 p-6 rounded-lg border border-orange-200">
            <p className="text-gray-600 text-sm">Total Withdrawals</p>
            <p className="text-2xl font-bold text-orange-600">₦{stats.totalWithdrawals.toLocaleString()}</p>
          </div>

          <div className="bg-purple-50 p-6 rounded-lg border border-purple-200">
            <p className="text-gray-600 text-sm">Active Investments</p>
            <p className="text-2xl font-bold text-purple-600">{stats.activeInvestmentsCount}</p>
          </div>
        </div>
      )}

      {/* Pending Deposits */}
      <div className="bg-white border rounded-lg p-6">
        <h2 className="text-2xl font-bold mb-4">Pending Deposits ({pendingDeposits?.length || 0})</h2>
        
        {pendingDeposits && pendingDeposits.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="px-4 py-2 text-left">User</th>
                  <th className="px-4 py-2 text-left">Amount</th>
                  <th className="px-4 py-2 text-left">Method</th>
                  <th className="px-4 py-2 text-left">Date</th>
                  <th className="px-4 py-2 text-left">Actions</th>
                </tr>
              </thead>
              <tbody>
                {pendingDeposits.map((tx: any) => (
                  <tr key={tx.id} className="border-b hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <div>
                        <p className="font-semibold">{tx.user?.fullName || 'N/A'}</p>
                        <p className="text-xs text-gray-500">{tx.user?.phoneNumber || 'N/A'}</p>
                      </div>
                    </td>
                    <td className="px-4 py-3 font-semibold">₦{tx.amount.toLocaleString()}</td>
                    <td className="px-4 py-3 capitalize">{tx.method}</td>
                    <td className="px-4 py-3 text-xs">
                      {new Date(tx.createdAt).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3 space-x-2">
                      <button
                        onClick={() => handleApprove(tx.id)}
                        disabled={processingId === tx.id}
                        className="px-3 py-1 bg-green-500 text-white rounded text-xs hover:bg-green-600 disabled:opacity-50"
                      >
                        {processingId === tx.id ? 'Processing...' : 'Approve'}
                      </button>
                      <button
                        onClick={() => handleReject(tx.id)}
                        disabled={processingId === tx.id}
                        className="px-3 py-1 bg-red-500 text-white rounded text-xs hover:bg-red-600 disabled:opacity-50"
                      >
                        {processingId === tx.id ? 'Processing...' : 'Reject'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-gray-600">No pending deposits</p>
        )}
      </div>

      {/* Recent Transactions */}
      {stats?.recentTransactions && (
        <div className="bg-white border rounded-lg p-6">
          <h2 className="text-xl font-bold mb-4">Recent Transactions</h2>
          <div className="space-y-3">
            {stats.recentTransactions.map((tx: any) => (
              <div key={tx.id} className="flex justify-between items-center border-b pb-3">
                <div>
                  <p className="font-semibold">{tx.user?.fullName}</p>
                  <p className="text-sm text-gray-600 capitalize">{tx.type}</p>
                </div>
                <div className="text-right">
                  <p className="font-semibold">₦{tx.amount.toLocaleString()}</p>
                  <p className="text-sm text-gray-600 capitalize">{tx.status}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
