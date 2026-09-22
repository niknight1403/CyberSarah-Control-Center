package com.cybersarah.app;

import android.app.PendingIntent;
import android.content.Intent;
import android.os.Build;
import android.util.Log;

import androidx.annotation.NonNull;
import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import androidx.core.app.NotificationChannelCompat;

import com.google.firebase.messaging.FirebaseMessagingService;
import com.google.firebase.messaging.RemoteMessage;

import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;

public class MessagingService extends FirebaseMessagingService {

    private static final String TAG = "CyberSarahPush";
    private static final int NOTIFICATION_ID = 1000;
    private static final String CHANNEL_ID = "cybersarah_default";
    private static final String API_BASE = "http://167.233.196.20:3000/api";

    @Override
    public void onNewToken(@NonNull String token) {
        Log.d(TAG, "Neuer FCM Token: " + token);
        registerTokenWithBackend(token);
    }

    @Override
    public void onMessageReceived(@NonNull RemoteMessage message) {
        Log.d(TAG, "Push empfangen: " + (message.getNotification() != null ? message.getNotification().getTitle() : "keine UI"));
        String title = message.getNotification() != null ? message.getNotification().getTitle() : "CyberSarah";
        String body = message.getNotification() != null ? message.getNotification().getBody() : "";
        String clickAction = message.getData() != null ? message.getData().get("clickAction") : null;
        showNotification(title, body, clickAction);
    }

    private void showNotification(String title, String body, String clickAction) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannelCompat channel = new NotificationChannelCompat.Builder(CHANNEL_ID,
                    NotificationManagerCompat.IMPORTANCE_HIGH)
                    .setName("CyberSarah Benachrichtigungen")
                    .setDescription("Push-Benachrichtigungen von CyberSarah Revenue OS")
                    .build();
            NotificationManagerCompat.from(this).createNotificationChannel(channel);
        }

        Intent intent = new Intent(this, MainActivity.class);
        if (clickAction != null) {
            intent.setData(android.net.Uri.parse(clickAction));
        }
        intent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);

        PendingIntent pendingIntent = PendingIntent.getActivity(
                this, 0, intent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        NotificationCompat.Builder builder = new NotificationCompat.Builder(this, CHANNEL_ID)
                .setSmallIcon(android.R.drawable.ic_dialog_info)
                .setContentTitle(title)
                .setContentText(body)
                .setPriority(NotificationCompat.PRIORITY_HIGH)
                .setAutoCancel(true)
                .setContentIntent(pendingIntent);

        NotificationManagerCompat.from(this).notify(NOTIFICATION_ID, builder.build());
    }

    private void registerTokenWithBackend(final String token) {
        new Thread(new Runnable() {
            @Override
            public void run() {
                try {
                    URL url = new URL(API_BASE + "/push/register");
                    HttpURLConnection conn = (HttpURLConnection) url.openConnection();
                    conn.setRequestMethod("POST");
                    conn.setRequestProperty("Content-Type", "application/json");
                    conn.setRequestProperty("Accept", "application/json");
                    conn.setDoOutput(true);
                    conn.setConnectTimeout(5000);
                    conn.setReadTimeout(5000);

                    String json = "{\"token\":\"" + token + "\",\"platform\":\"android\",\"topics\":[\"system\",\"umsatz\",\"agent_aktiv\"]}";
                    OutputStream os = conn.getOutputStream();
                    os.write(json.getBytes(StandardCharsets.UTF_8));
                    os.flush();
                    os.close();

                    int responseCode = conn.getResponseCode();
                    Log.d(TAG, "Token registriert: HTTP " + responseCode);
                    conn.disconnect();
                } catch (Exception e) {
                    Log.e(TAG, "Token-Registrierung fehlgeschlagen: " + e.getMessage());
                }
            }
        }).start();
    }
}
