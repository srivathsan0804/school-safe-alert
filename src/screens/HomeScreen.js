import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert, Vibration, TextInput } from 'react-native';
import * as Location from 'expo-location';
import { database } from '../../firebaseConfig';
import { ref, push, serverTimestamp, onValue } from "firebase/database";

export default function HomeScreen() {
  const [studentName, setStudentName] = useState('');
  const [isLockdown, setIsLockdown] = useState(false); 

  // --- 1. THE LISTENER (With Tracers) ---
  useEffect(() => {
    console.log("🎧 Ear is listening to Firebase...");
    const alertsRef = ref(database, 'alerts');
    
    const unsubscribe = onValue(alertsRef, (snapshot) => {
      const data = snapshot.val();
      console.log("📥 New data received from Firebase:", data ? "Data exists" : "Empty");
      
      if (data) {
        const activeThreat = Object.values(data).some(alert => alert.status === 'broadcasted');
        console.log("🚨 Active Threat Detected in Database:", activeThreat);
        setIsLockdown(activeThreat); 
      } else {
        setIsLockdown(false);
      }
    });
    return () => unsubscribe(); 
  }, []);

  // --- 2. THE VIBRATION CONTROLLER (With Tracers) ---
  useEffect(() => {
    console.log("⚙️ Lockdown State Changed to:", isLockdown);
    
    if (isLockdown) {
      console.log("⚡ TRIGGERING ALARM MOTOR NOW!");
      Vibration.cancel(); // Force reset the motor
      Vibration.vibrate([0, 500, 200, 500, 200, 500], true); 
      
      Alert.alert(
        "🔴 CRITICAL EMERGENCY", 
        "A threat is confirmed. Lockdown procedures active!",
        [{ text: "STOP ALARM", onPress: () => {
          console.log("🛑 User manually stopped alarm.");
          Vibration.cancel();
        }}]
      );
    } else {
      console.log("🔇 Stopping alarm motor (False Alarm / Resolved).");
      Vibration.cancel();
    }
  }, [isLockdown]);

  // --- PANIC BUTTON ---
  const handlePress = async () => {
    if (studentName.trim() === '') {
      Alert.alert("Wait!", "Please enter your name first.");
      return;
    }

    try {
      let { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') return Alert.alert("Permission Denied", "GPS required.");

      let isLocationOn = await Location.hasServicesEnabledAsync();
      if (!isLocationOn) return Alert.alert("GPS is Off", "Please turn on Location services.");

      let location = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      
      const alertsRef = ref(database, 'alerts');
      push(alertsRef, {
        type: "PANIC_BUTTON_PRESSED",
        senderName: studentName,
        coords: { latitude: location.coords.latitude, longitude: location.coords.longitude },
        timestamp: serverTimestamp(),
        status: "pending" 
      });

      console.log("✅ Button pressed, sent to Firebase as 'pending'");
      Vibration.vibrate(100); 
      Alert.alert("SUCCESS", "Emergency alert sent. Security has been notified.");

    } catch (error) {
      console.error(error);
      Alert.alert("ERROR", "Failed to send alert.");
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.headerText}>Smart School Safe</Text>
      <TextInput
        style={styles.input}
        placeholder="Enter your Full Name"
        placeholderTextColor="#888"
        value={studentName}
        onChangeText={setStudentName}
      />
      <TouchableOpacity activeOpacity={0.7} style={styles.panicButton} onPress={handlePress}>
        <View style={styles.innerCircle}>
          <Text style={styles.buttonText}>EMERGENCY ALERT</Text>
        </View>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000000', alignItems: 'center', justifyContent: 'center' },
  headerText: { fontSize: 28, fontWeight: '900', color: '#ffffff', marginBottom: 40, letterSpacing: 1 },
  input: { width: '80%', backgroundColor: '#222', color: '#fff', padding: 15, borderRadius: 10, fontSize: 18, marginBottom: 40, textAlign: 'center', borderWidth: 1, borderColor: '#444' },
  panicButton: { width: 280, height: 280, backgroundColor: '#7f0000', borderRadius: 140, alignItems: 'center', justifyContent: 'center', elevation: 20, shadowColor: '#ff0000', shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.8, shadowRadius: 20 },
  innerCircle: { width: 240, height: 240, backgroundColor: '#d32f2f', borderRadius: 120, alignItems: 'center', justifyContent: 'center', borderWidth: 4, borderColor: '#ff6666' },
  buttonText: { color: '#ffffff', fontSize: 24, fontWeight: 'bold', textAlign: 'center' }
});