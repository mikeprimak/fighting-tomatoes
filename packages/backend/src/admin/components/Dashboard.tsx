import React, { useEffect, useState } from 'react';
import { Box, H2, H5, Text, Loader } from '@adminjs/design-system';
import { ApiClient } from 'adminjs';

interface DashboardStats {
  users: {
    total: number;
    activeToday: number;
    activeWeek: number;
    newThisWeek: number;
  };
  engagement: {
    totalRatings: number;
    totalReviews: number;
    ratingsToday: number;
  };
  content: {
    totalEvents: number;
    totalFights: number;
    totalFighters: number;
    upcomingEvents: number;
  };
  scraper: {
    lastRun: string | null;
    status: 'success' | 'error' | 'running' | 'idle';
    message: string;
  };
}

const Dashboard: React.FC = () => {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const api = new ApiClient();

  useEffect(() => {
    fetchStats();
    // Refresh every 30 seconds
    const interval = setInterval(fetchStats, 30000);
    return () => clearInterval(interval);
  }, []);

  const fetchStats = async () => {
    try {
      const response = await fetch('/api/admin/stats');
      const data = await response.json();
      setStats(data);
    } catch (error) {
      console.error('Error fetching stats:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <Box variant="grey" padding="xxl">
        <Loader />
      </Box>
    );
  }

  if (!stats) {
    return (
      <Box variant="grey" padding="xxl">
        <Text>Failed to load dashboard stats</Text>
      </Box>
    );
  }

  const StatCard = ({ title, value, subtitle }: { title: string; value: number | string; subtitle?: string }) => (
    <Box
      variant="white"
      padding="lg"
      style={{
        border: '1px solid #e0e0e0',
        borderRadius: '8px',
        marginBottom: '16px',
      }}
    >
      <H5 style={{ marginBottom: '8px', color: '#666' }}>{title}</H5>
      <H2 style={{ marginBottom: '4px' }}>{value.toLocaleString()}</H2>
      {subtitle && <Text fontSize="sm" color="grey60">{subtitle}</Text>}
    </Box>
  );

  return (
    <Box padding="xxl">
      <H2 marginBottom="xl">FightCrewApp Dashboard</H2>

      {/* User Metrics */}
      <Box marginBottom="xl">
        <H5 marginBottom="lg">User Engagement</H5>
        <Box
          display="grid"
          gridTemplateColumns="repeat(auto-fit, minmax(200px, 1fr))"
          gridGap="16px"
        >
          <StatCard title="Total Users" value={stats.users.total} />
          <StatCard title="Active Today" value={stats.users.activeToday} />
          <StatCard title="Active This Week" value={stats.users.activeWeek} />
          <StatCard title="New This Week" value={stats.users.newThisWeek} />
        </Box>
      </Box>

      {/* Engagement Metrics */}
      <Box marginBottom="xl">
        <H5 marginBottom="lg">User Activity</H5>
        <Box
          display="grid"
          gridTemplateColumns="repeat(auto-fit, minmax(200px, 1fr))"
          gridGap="16px"
        >
          <StatCard title="Total Ratings" value={stats.engagement.totalRatings} />
          <StatCard title="Total Reviews" value={stats.engagement.totalReviews} />
          <StatCard title="Ratings Today" value={stats.engagement.ratingsToday} />
        </Box>
      </Box>

      {/* Content Stats */}
      <Box marginBottom="xl">
        <H5 marginBottom="lg">Content</H5>
        <Box
          display="grid"
          gridTemplateColumns="repeat(auto-fit, minmax(200px, 1fr))"
          gridGap="16px"
        >
          <StatCard title="Total Events" value={stats.content.totalEvents} />
          <StatCard title="Total Fights" value={stats.content.totalFights} />
          <StatCard title="Total Fighters" value={stats.content.totalFighters} />
          <StatCard title="Upcoming Events" value={stats.content.upcomingEvents} />
        </Box>
      </Box>

      {/* Scraper Status */}
      <Box marginBottom="xl">
        <H5 marginBottom="lg">Live Event Scraper</H5>
        <Box
          variant="white"
          padding="lg"
          style={{
            border: `2px solid ${stats.scraper.status === 'success' ? '#4caf50' : stats.scraper.status === 'error' ? '#f44336' : '#ff9800'}`,
            borderRadius: '8px',
            backgroundColor: stats.scraper.status === 'success' ? '#f1f8f4' : stats.scraper.status === 'error' ? '#fef1f0' : '#fff8e1',
          }}
        >
          <Text fontWeight="bold" fontSize="lg" marginBottom="sm">
            Status: {stats.scraper.status.toUpperCase()}
          </Text>
          <Text marginBottom="sm">{stats.scraper.message}</Text>
          {stats.scraper.lastRun && (
            <Text fontSize="sm" color="grey60">
              Last run: {new Date(stats.scraper.lastRun).toLocaleString()}
            </Text>
          )}
        </Box>
      </Box>
    </Box>
  );
};

export default Dashboard;
