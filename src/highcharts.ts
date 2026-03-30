import Highcharts from "highcharts/highstock"
import "highcharts/highcharts-more"
import "highcharts/highcharts-3d"
import "highcharts/modules/exporting"
import "highcharts/modules/offline-exporting"
import "highcharts/modules/export-data"
import "highcharts/modules/no-data-to-display"
import "highcharts/modules/pattern-fill"
import "highcharts/modules/annotations"
import "highcharts/modules/accessibility"
import "highcharts/modules/drilldown"
import "highcharts/modules/coloraxis"
import "highcharts/modules/cylinder"
import "highcharts/modules/funnel"
import "highcharts/modules/heatmap"
import "highcharts/modules/treemap"
import "highcharts/modules/boost"
import "highcharts/modules/venn"
import "highcharts/modules/xrange"




// Fix for zombie tooltip containers
// See https://github.com/highcharts/highcharts/issues/18490
Highcharts.wrap(Highcharts.Tooltip.prototype, 'hide', function(p, delay) {
    // @ts-ignore
    const tooltip = this;
    if (tooltip.options.destroyWhenHiding) {
        tooltip.destroy()
    } else {
        p(delay)
    }
});

export default Highcharts