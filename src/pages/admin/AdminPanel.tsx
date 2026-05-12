import { useQuery } from 'wasp/client/operations';
import { adminGetDashboardStats, adminGetPendingDeposits } from 'wasp/client/operations';
import { adminApproveDeposit, adminRejectDeposit } from 'wasp/client/operations';
import { useState } from 'react';

export const AdminPanelPage = () => {
  const { data: stats, isLoading: statsLoading } = useQuery(adminGetDashboardStats);
  const { data: pendingDeposits, isLoading: depositsLoading } = useQuery(adminGetPendingDeposits);
  const [actionLoading, setActionLoading] = useState(false);
  const [message, setMessage] = useState('');

  const handleApproveDeposit = async (transactionId: number) => {
    try {
      setActionLoading(true);
      await adminApproveDeposit({ transactionId });
      setMessage('Deposit approved successfully!');
      setTimeout(() => setMessage(''), 3000);
    } catch (err: any) {
      setMessage(err.message || 'Failed to approve deposit');
    } finally {
      setActionLoading(false);
    }
  };

  const handleRejectDeposit = async (transactionId: number) => {
    try {
      setActionLoading(true);
      await adminRejectDeposit({ transactionId, adminNote: 'Rejected by admin' });
      setMessage('Deposit rejected');
      setTimeout(() => setMessage(''), 3000);
    } catch (err: any) {
      setMessage(err.message || 'Failed to reject deposit');
    } finally {
      setActionLoading(false);
    }
  };

  if (statsLoading || depositsLoading) return <div className="text-center py-8">Loading admin data...</div>;

  return (
    <div className="py-8">
      <h1 className="text-3xl font-bold mb-8">Admin Dashboard</h1>
      {message && <div className="bg-blue-50 p-4 rounded mb-4 text-blue-800">{message}</div>}

      {/* Stats Grid */}
      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <div className="bg-white shadow rounded-lg p-6">
            <h3 className="text-gray-600 text-sm">Total Users</h3>
            <p className="text-3xl font-bold text-blue-600">{stats.totalUsers}</p>
          </div>
          <div className="bg-white shadow rounded-lg p-6">
            <h3 className="text-gray-600 text-sm">Total Deposits</h3>
            <p className="text-3xl font-bold text-green-600">₦{stats.totalDeposits.toLocaleString()}</p>
          </div>
          <div className="bg-white shadow rounded-lg p-6">
            <h3 className="text-gray-600 text-sm">Total Withdrawals</h3>
            <p className="text-3xl font-bold text-orange-600">₦{stats.totalWithdrawals.toLocaleString()}</p>
          </div>
          <div className="bg-white shadow rounded-lg p-6">
            <h3 className="text-gray-600 text-sm">Active Investments</h3>
            <p className="text-3xl font-bold text-purple-600">{stats.activeInvestmentsCount}</p>
          </div>
        </div>
      )}

      {/* Pending Deposits */}
      <div className="bg-white shadow rounded-lg p-6">
        <h2 className="text-2xl font-bold mb-4">Pending Deposits</h2>
        {pendingDeposits && pendingDeposits.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-100">
                <tr>
                  <th className="px-4 py-2 text-left">User</th>
                  <th className="px-4 py-2 text-left">Amount</th>
                  <th className="px-4 py-2 text-left">Method</th>
                  <th className="px-4 py-2 text-left">Date</th>
                  <th className="px-4 py-2 text-left">Actions</th>
                </tr>
              </thead>
              <tbody>
                {pendingDeposits.map((tx) => (
                  <tr key={tx.id} className="border-b hover:bg-gray-50">
                    <td className="px-4 py-2">{tx.user.fullName || tx.user.phoneNumber || 'N/A'}</td>
                    <td className="px-4 py-2 font-semibold">₦{tx.amount.toLocaleString()}</td>
                    <td className="px-4 py-2">{tx.method}</td>
                    <td className="px-4 py-2">{new Date(tx.createdAt).toLocaleDateString()}</td>
                    <td className="px-4 py-2 space-x-2">
                      <button
                        onClick={() => handleApproveDeposit(tx.id)}
                        disabled={actionLoading}
                        className="bg-green-500 hover:bg-green-600 text-white px-3 py-1 rounded text-xs"
                      >
                        Approve
                      </button>
                      <button
                        onClick={() => handleRejectDeposit(tx.id)}
                        disabled={actionLoading}
                        className="bg-red-500 hover:bg-red-600 text-white px-3 py-1 rounded text-xs"
                      >
                        Reject
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
    </div>
  );
};

export default AdminPanelPage;