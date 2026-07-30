import type { PageComparison } from "@brief/shared";
import { ActionPlan } from "./ActionPlan";
import { KeywordGaps } from "./KeywordGaps";
import { MetaIssues } from "./MetaIssues";
import { MetricsGrid } from "./MetricsGrid";
import { ScoreCard } from "./ScoreCard";
import { SectionGaps } from "./SectionGaps";

interface ComparisonReportProps {
  comparison: PageComparison;
}

/**
 * Звіт порівняння. Порядок блоків — від висновку до підстав:
 * бал і вирок, чим його поміряли, що робити, і далі докази —
 * структура, ключі, метадані. Читати згори донизу можна, не пропускаючи.
 */
export function ComparisonReport({ comparison }: ComparisonReportProps) {
  return (
    <div className="space-y-4">
      <ScoreCard
        score={comparison.score}
        verdict={comparison.verdict}
        comparedAt={comparison.comparedAt}
        competitorCount={comparison.competitorCount}
        contentLanguage={comparison.contentLanguage}
      />
      <MetricsGrid metrics={comparison.metrics} />
      <ActionPlan
        actions={comparison.actions}
        strengths={comparison.strengths}
      />
      <SectionGaps sections={comparison.sections} />
      <KeywordGaps keywords={comparison.keywords} />
      <MetaIssues issues={comparison.meta} />
    </div>
  );
}
