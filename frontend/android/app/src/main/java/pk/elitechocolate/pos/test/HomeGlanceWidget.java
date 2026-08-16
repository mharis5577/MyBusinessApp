package pk.elitechocolate.pos.test;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.widget.RemoteViews;

import org.json.JSONObject;

import java.io.File;
import java.io.FileInputStream;
import java.nio.charset.StandardCharsets;
import java.text.NumberFormat;
import java.util.Locale;

public class HomeGlanceWidget extends AppWidgetProvider {
    @Override
    public void onUpdate(Context context, AppWidgetManager appWidgetManager, int[] appWidgetIds) {
        for (int id : appWidgetIds) {
            appWidgetManager.updateAppWidget(id, buildViews(context));
        }
    }

    public static void refreshAll(Context context) {
        AppWidgetManager manager = AppWidgetManager.getInstance(context);
        int[] ids = manager.getAppWidgetIds(new ComponentName(context, HomeGlanceWidget.class));
        if (ids == null || ids.length == 0) return;
        RemoteViews views = buildViews(context);
        for (int id : ids) {
            manager.updateAppWidget(id, views);
        }
    }

    private static RemoteViews buildViews(Context context) {
        RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.home_widget);
        Stats stats = readStats(context);
        views.setTextViewText(R.id.home_widget_profit, money(stats.currency, stats.profitToday));
        views.setTextViewText(R.id.home_widget_overdue, money(stats.currency, stats.overdue));

        Intent open = new Intent(context, MainActivity.class);
        open.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent pi = PendingIntent.getActivity(
            context,
            0,
            open,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
        views.setOnClickPendingIntent(R.id.home_widget_root, pi);
        return views;
    }

    private static Stats readStats(Context context) {
        Stats stats = new Stats();
        try {
            File file = new File(context.getFilesDir(), "widget-stats.json");
            if (!file.exists() || !file.canRead()) return stats;
            byte[] bytes = new byte[(int) file.length()];
            int read;
            try (FileInputStream in = new FileInputStream(file)) {
                read = in.read(bytes);
                if (read <= 0) return stats;
            }
            String raw = new String(bytes, 0, read, StandardCharsets.UTF_8);
            JSONObject json = new JSONObject(raw);
            stats.profitToday = json.optDouble("profit_today", 0);
            stats.overdue = json.optDouble("overdue", 0);
            String currency = json.optString("currency", "Rs.");
            stats.currency = currency == null || currency.trim().isEmpty() ? "Rs." : currency.trim();
        } catch (Exception ignored) {
            /* keep defaults */
        }
        return stats;
    }

    private static String money(String currency, double amount) {
        NumberFormat nf = NumberFormat.getIntegerInstance(new Locale("en", "PK"));
        return currency + " " + nf.format(Math.round(amount));
    }

    private static class Stats {
        double profitToday;
        double overdue;
        String currency = "Rs.";
    }
}
