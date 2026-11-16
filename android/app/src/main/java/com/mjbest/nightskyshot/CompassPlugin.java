package com.mjbest.nightskyshot;

import android.content.Context;
import android.hardware.Sensor;
import android.hardware.SensorEvent;
import android.hardware.SensorEventListener;
import android.hardware.SensorManager;
import android.os.Build;
import android.os.SystemClock;
import android.view.Display;
import android.view.Surface;
import android.view.WindowManager;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "Compass")
public class CompassPlugin extends Plugin implements SensorEventListener {

    private static final long MIN_INTERVAL_MS = 50L;

    private SensorManager sensorManager;
    private Sensor rotationSensor;
    private Sensor accelSensor;
    private Sensor magneticSensor;

    private final float[] gravity = new float[3];
    private final float[] geomagnetic = new float[3];
    private final float[] rotationMatrix = new float[9];
    private final float[] adjustedMatrix = new float[9];
    private final float[] orientation = new float[3];

    private boolean hasGravity = false;
    private boolean hasMagnetic = false;
    private boolean active = false;
    private boolean registered = false;
    private long lastEmitMs = 0L;

    @Override
    public void load() {
        sensorManager = (SensorManager) getContext().getSystemService(Context.SENSOR_SERVICE);
        if (sensorManager != null) {
            rotationSensor = sensorManager.getDefaultSensor(Sensor.TYPE_ROTATION_VECTOR);
            accelSensor = sensorManager.getDefaultSensor(Sensor.TYPE_ACCELEROMETER);
            magneticSensor = sensorManager.getDefaultSensor(Sensor.TYPE_MAGNETIC_FIELD);
        }
    }

    private boolean hasCompass() {
        if (sensorManager == null) return false;
        return rotationSensor != null || (accelSensor != null && magneticSensor != null);
    }

    @PluginMethod
    public void isAvailable(PluginCall call) {
        JSObject res = new JSObject();
        res.put("available", hasCompass());
        call.resolve(res);
    }

    @PluginMethod
    public void start(PluginCall call) {
        if (!hasCompass()) {
            call.reject("이 기기는 나침반 센서를 지원하지 않아요.");
            return;
        }
        active = true;
        registerSensors();
        call.resolve();
    }

    @PluginMethod
    public void stop(PluginCall call) {
        active = false;
        unregisterSensors();
        call.resolve();
    }

    @Override
    protected void handleOnPause() {
        unregisterSensors();
    }

    @Override
    protected void handleOnResume() {
        if (active) {
            registerSensors();
        }
    }

    @Override
    protected void handleOnDestroy() {
        active = false;
        unregisterSensors();
    }

    private void registerSensors() {
        if (sensorManager == null || registered) return;
        hasGravity = false;
        hasMagnetic = false;
        lastEmitMs = 0L;

        if (rotationSensor != null) {
            registered = sensorManager.registerListener(this, rotationSensor, SensorManager.SENSOR_DELAY_UI);
        } else if (accelSensor != null && magneticSensor != null) {
            boolean okAcc = sensorManager.registerListener(this, accelSensor, SensorManager.SENSOR_DELAY_UI);
            boolean okMag = sensorManager.registerListener(this, magneticSensor, SensorManager.SENSOR_DELAY_UI);
            registered = okAcc && okMag;
        }
    }

    private void unregisterSensors() {
        if (sensorManager != null && registered) {
            sensorManager.unregisterListener(this);
        }
        registered = false;
    }

    private int getDisplayRotation() {
        if (getActivity() == null) return Surface.ROTATION_0;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            Display display = getActivity().getDisplay();
            if (display != null) return display.getRotation();
        }
        WindowManager wm = (WindowManager) getContext().getSystemService(Context.WINDOW_SERVICE);
        if (wm != null && wm.getDefaultDisplay() != null) {
            return wm.getDefaultDisplay().getRotation();
        }
        return Surface.ROTATION_0;
    }

    @Override
    public void onSensorChanged(SensorEvent event) {
        if (!active || event == null) return;

        boolean matrixReady = false;
        int type = event.sensor.getType();
        if (type == Sensor.TYPE_ROTATION_VECTOR) {
            SensorManager.getRotationMatrixFromVector(rotationMatrix, event.values);
            matrixReady = true;
        } else if (type == Sensor.TYPE_ACCELEROMETER) {
            System.arraycopy(event.values, 0, gravity, 0, Math.min(3, event.values.length));
            hasGravity = true;
            if (hasMagnetic) {
                matrixReady = SensorManager.getRotationMatrix(rotationMatrix, null, gravity, geomagnetic);
            }
        } else if (type == Sensor.TYPE_MAGNETIC_FIELD) {
            System.arraycopy(event.values, 0, geomagnetic, 0, Math.min(3, event.values.length));
            hasMagnetic = true;
            if (hasGravity) {
                matrixReady = SensorManager.getRotationMatrix(rotationMatrix, null, gravity, geomagnetic);
            }
        }

        if (!matrixReady) return;

        long now = SystemClock.elapsedRealtime();
        if (now - lastEmitMs < MIN_INTERVAL_MS) return;
        lastEmitMs = now;

        int axisX = SensorManager.AXIS_X;
        int axisY = SensorManager.AXIS_Y;
        switch (getDisplayRotation()) {
            case Surface.ROTATION_90:
                axisX = SensorManager.AXIS_Y;
                axisY = SensorManager.AXIS_MINUS_X;
                break;
            case Surface.ROTATION_180:
                axisX = SensorManager.AXIS_MINUS_X;
                axisY = SensorManager.AXIS_MINUS_Y;
                break;
            case Surface.ROTATION_270:
                axisX = SensorManager.AXIS_MINUS_Y;
                axisY = SensorManager.AXIS_X;
                break;
            default:
                break;
        }

        if (!SensorManager.remapCoordinateSystem(rotationMatrix, axisX, axisY, adjustedMatrix)) {
            System.arraycopy(rotationMatrix, 0, adjustedMatrix, 0, 9);
        }

        SensorManager.getOrientation(adjustedMatrix, orientation);
        double azimuthDeg = Math.toDegrees(orientation[0]);
        double heading = ((azimuthDeg % 360.0) + 360.0) % 360.0;

        JSObject data = new JSObject();
        data.put("magneticHeading", heading);
        notifyListeners("heading", data);
    }

    @Override
    public void onAccuracyChanged(Sensor sensor, int accuracy) {
        // 별도 처리 없음
    }
}
