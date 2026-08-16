package pk.elitechocolate.pos.test;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "HomeWidget")
public class HomeWidgetPlugin extends Plugin {
    @PluginMethod
    public void refresh(PluginCall call) {
        HomeGlanceWidget.refreshAll(getContext());
        call.resolve();
    }
}
