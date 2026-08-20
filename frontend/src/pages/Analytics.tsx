import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { RefreshCw } from 'lucide-react';
import { ordersApi, Order } from '../api/orders';
import BottomNav from '../components/BottomNav';
import SettingsModal from '../components/SettingsModal';
import { useAuthStore } from '../store/authStore';
import VerticalBarChart from '../components/charts/VerticalBarChart';
import HorizontalBarChart from '../components/charts/HorizontalBarChart';
import ChartLegend from '../components/charts/ChartLegend';
import MonthYearNav from '../components/MonthYearNav';
import YearNav from '../components/YearNav';
import CategoryTitle from '../components/CategoryTitle';
import AnalyticsMetricToggle from '../components/AnalyticsMetricToggle';
import { analyticsOrdersPath } from '../lib/analyticsDrillDown';
import { saveScrollPosition } from '../lib/scrollRestoration';
import {
  aggregateByMonth,
  aggregateByCategory,
  aggregateCategoryByMonth,
  categoryKey,
  currentMonthKey,
  qualifiesForAnalytics,
  sortCategoryIds,
  currentCalendarYear,
  yearRangeForYear,
  yearPickerOptions,
  monthPickerOptions,
  monthRangeFromKey,
  rolling365DayMonthlyAverage,
  rolling365DayMonthlyAverageByCategory,
  type AnalyticsMetric,
  type ChartBar,
} from '../lib/expenseStats';

export default function Analytics() {
  const navigate = useNavigate();
  const location = useLocation();

  const goToOrders = (path: string) => {
    saveScrollPosition(location.key);
    navigate(path);
  };
  const { logout } = useAuthStore();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [showSettings, setShowSettings] = useState(false);
  const [selectedMonthKey, setSelectedMonthKey] = useState(currentMonthKey);
  const [selectedChartYear, setSelectedChartYear] = useState(currentCalendarYear);
  const [categoryYearOverrides, setCategoryYearOverrides] = useState<Record<string, number>>({});
  const [metric, setMetric] = useState<AnalyticsMetric>('amount');

  const getCategoryYear = (categoryId: string) =>
    categoryYearOverrides[categoryId] ?? selectedChartYear;

  const loadOrders = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await ordersApi.getAll();
      setOrders(data);
    } catch {
      setOrders([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadOrders();
  }, [loadOrders]);

  const chartYearRange = useMemo(
    () => yearRangeForYear(selectedChartYear),
    [selectedChartYear],
  );
  const yearPickerOpts = useMemo(
    () => yearPickerOptions(orders, selectedChartYear, metric),
    [orders, selectedChartYear, metric],
  );
  const selectedMonthRange = useMemo(
    () => monthRangeFromKey(selectedMonthKey),
    [selectedMonthKey],
  );
  const monthPickerOpts = useMemo(
    () => monthPickerOptions(orders, selectedMonthKey, metric),
    [orders, selectedMonthKey, metric],
  );

  const monthlyBars = useMemo(
    () => aggregateByMonth(orders, metric, selectedChartYear),
    [orders, metric, selectedChartYear],
  );
  const hasYearChartData = useMemo(
    () => monthlyBars.some((b) => b.value > 0),
    [monthlyBars],
  );
  const monthCategoryBars = useMemo(
    () => aggregateByCategory(orders, selectedMonthRange.start, selectedMonthRange.end, metric),
    [orders, selectedMonthRange.start, selectedMonthRange.end, metric],
  );
  const yearCategoryBars = useMemo(
    () => aggregateByCategory(orders, chartYearRange.start, chartYearRange.end, metric),
    [orders, chartYearRange.start, chartYearRange.end, metric],
  );
  const rollingMonthlyAverage = useMemo(
    () => rolling365DayMonthlyAverage(orders, metric),
    [orders, metric],
  );
  const rollingCategoryMonthlyAverages = useMemo(
    () => rolling365DayMonthlyAverageByCategory(orders, metric),
    [orders, metric],
  );

  const categoriesWithData = useMemo(() => {
    const ids = new Set<string>();
    for (const o of orders) {
      if (!qualifiesForAnalytics(o, metric)) continue;
      ids.add(categoryKey(o));
    }
    return sortCategoryIds([...ids]);
  }, [orders, metric]);

  const handleMonthBar = (bar: ChartBar) => {
    goToOrders(analyticsOrdersPath({ kind: 'month', monthKey: bar.key, metric }));
  };

  const handleMonthCategoryBar = (bar: ChartBar) => {
    goToOrders(
      analyticsOrdersPath({
        kind: 'category_month',
        categoryId: bar.key,
        monthKey: selectedMonthKey,
        metric,
      }),
    );
  };

  const handleYearCategoryBar = (bar: ChartBar) => {
    goToOrders(
      analyticsOrdersPath({
        kind: 'category_year',
        categoryId: bar.key,
        year: selectedChartYear,
        metric,
      }),
    );
  };

  const handleCategoryMonthBar = (categoryId: string, bar: ChartBar) => {
    goToOrders(
      analyticsOrdersPath({
        kind: 'category_month_bar',
        categoryId,
        monthKey: bar.key,
        metric,
      }),
    );
  };

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      <div className="px-4 py-4 space-y-4">
        <div className="flex items-center justify-between mb-3 gap-2">
          <h2 className="text-lg font-semibold text-gray-800">Analytics</h2>
          <div className="flex items-center gap-2 flex-shrink-0">
            <AnalyticsMetricToggle metric={metric} onChange={setMetric} />
            <button
              type="button"
              onClick={loadOrders}
              disabled={loading}
              className="p-2 text-gray-400 hover:text-gray-600 rounded-lg transition-colors"
              aria-label="Analytics aktualisieren"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>
        {loading ? (
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="card animate-pulse h-48 bg-gray-100" />
            ))}
          </div>
        ) : (
          <>
            <ChartLegend showAverage={hasYearChartData} />
            <section className="card">
              <div className="flex items-start justify-between gap-2 mb-3">
                <div>
                  <h2 className="text-sm font-semibold text-gray-800">
                    {metric === 'amount' ? 'Ausgaben pro Monat' : 'Bestellungen pro Monat'}
                  </h2>
                  <p className="text-xs text-gray-400 mt-0.5">
                    Tippe auf einen Balken für die Bestellungen
                  </p>
                </div>
                <YearNav
                  year={selectedChartYear}
                  options={yearPickerOpts}
                  onChange={setSelectedChartYear}
                />
              </div>
              <VerticalBarChart
                items={monthlyBars}
                metric={metric}
                showAverageLine
                averageValue={rollingMonthlyAverage}
                onBarClick={handleMonthBar}
                height={220}
              />
            </section>

            <section className="card">
              <div className="flex items-start justify-between gap-2 mb-3">
                <div>
                  <h2 className="text-sm font-semibold text-gray-800">
                    {metric === 'amount' ? 'Ausgaben pro Kategorie' : 'Bestellungen pro Kategorie'}
                  </h2>
                  <p className="text-xs text-gray-400 mt-0.5">Verteilung im gewählten Jahr</p>
                </div>
                <YearNav
                  year={selectedChartYear}
                  options={yearPickerOpts}
                  onChange={setSelectedChartYear}
                />
              </div>
              <HorizontalBarChart
                items={yearCategoryBars}
                metric={metric}
                showAverageLine
                averageByKey={rollingCategoryMonthlyAverages}
                onBarClick={handleYearCategoryBar}
              />
            </section>

            <section className="card">
              <div className="flex items-start justify-between gap-2 mb-1">
                <h2 className="text-sm font-semibold text-gray-800">Kategorien</h2>
                <MonthYearNav
                  monthKey={selectedMonthKey}
                  options={monthPickerOpts}
                  onChange={setSelectedMonthKey}
                />
              </div>
              <p className="text-xs text-gray-400 mb-3">Verteilung im gewählten Monat</p>
              <HorizontalBarChart
                items={monthCategoryBars}
                metric={metric}
                onBarClick={handleMonthCategoryBar}
                emptyMessage={
                  metric === 'amount'
                    ? 'Keine Ausgaben in diesem Monat'
                    : 'Keine Bestellungen in diesem Monat'
                }
              />
            </section>

            {categoriesWithData.map((catId) => {
              const catYear = getCategoryYear(catId);
              const catYearOpts = yearPickerOptions(orders, catYear, metric);
              const bars = aggregateCategoryByMonth(orders, catId, metric, catYear);
              if (!bars.some((b) => b.value > 0)) return null;
              return (
                <section key={catId} className="card">
                  <div className="flex items-start justify-between gap-2 mb-3">
                    <div>
                      <CategoryTitle
                        categoryId={catId}
                        as="h2"
                        className="text-sm font-semibold text-gray-800"
                        iconClassName="w-4 h-4 text-gray-600 flex-shrink-0"
                      />
                      <p className="text-xs text-gray-400 mt-0.5">
                        {metric === 'amount' ? 'Ausgaben pro Monat' : 'Bestellungen pro Monat'}
                      </p>
                    </div>
                    <YearNav
                      year={catYear}
                      options={catYearOpts}
                      onChange={(year) => setCategoryYearOverrides((prev) => ({ ...prev, [catId]: year }))}
                    />
                  </div>
                  <VerticalBarChart
                    items={bars}
                    metric={metric}
                    onBarClick={(bar) => handleCategoryMonthBar(catId, bar)}
                    height={200}
                  />
                </section>
              );
            })}

            {!hasYearChartData && (
              <div className="text-center py-12 text-gray-400 text-sm">
                {metric === 'amount'
                  ? 'Noch keine Bestellungen mit Preis erfasst.'
                  : 'Noch keine Bestellungen erfasst.'}
              </div>
            )}
          </>
        )}
      </div>

      <BottomNav
        activeTab={showSettings ? 'settings' : 'analytics'}
        onTabChange={(tab) => {
          if (tab === 'analytics') {
            setShowSettings(false);
            return;
          }
          setShowSettings(false);
          navigate(tab === 'orders' ? '/?tab=orders' : '/?tab=emails');
        }}
        onSettings={() => setShowSettings(true)}
        showSettings={showSettings}
      />

      {showSettings && (
        <SettingsModal onClose={() => setShowSettings(false)} onLogout={logout} />
      )}
    </div>
  );
}
