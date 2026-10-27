import { MessageExperience } from './useMessageExperience';
import { CompareDialog } from './CompareDialog';
import { FilterBar } from './FilterBar';
import { RulesDialog } from './RulesDialog';
import { ViewTabs } from './ViewTabs';

export function ExperienceHeader({ experience }: { experience: MessageExperience }) {
  const { ui, update } = experience;
  return (
    <>
      <div className="kafka-view-bar">
        <ViewTabs
          views={ui.views}
          activeId={experience.activeViewId}
          canAdd={experience.canAddView}
          onSelect={experience.selectView}
          onAdd={experience.addView}
          onClose={experience.closeView}
        />
        <RulesDialog rules={ui.rules} hits={experience.ruleHits} onChange={(rules) => update({ rules })} />
      </div>
      <FilterBar filter={experience.filter} onChange={experience.setFilter} savedFilters={ui.savedFilters} onSavedFiltersChange={(savedFilters) => update({ savedFilters })} />
      <CompareDialog messages={experience.compared} onClose={() => experience.setCompared(null)} />
    </>
  );
}
