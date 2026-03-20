import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert, Vibration, TextInput, Dimensions } from 'react-native';
import * as Location from 'expo-location';
import { database } from '../../firebaseConfig';
import { ref, push, serverTimestamp, onValue } from "firebase/database";

// ==========================================
// 🧠 1. GEOSPATIAL MATH & AI SECTOR ASSIGNMENT
// ==========================================

const calculateDistance = (lat1, lon1, lat2, lon2) => {
  const R = 6371e3; 
  const toRad = (degrees) => degrees * (Math.PI / 180);
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return R * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
};

const getBearing = (startLat, startLng, destLat, destLng) => {
  const toRad = (deg) => (deg * Math.PI) / 180;
  const toDeg = (rad) => (rad * 180) / Math.PI;
  const lat1 = toRad(startLat);
  const lat2 = toRad(destLat);
  const dLng = toRad(destLng - startLng);
  const y = Math.sin(dLng) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
  return (toDeg(Math.atan2(y, x)) + 360) % 360; 
};

// 🔴 UPDATED: Now requires the 'availablePoints' passed dynamically from Firebase
const getBestRallyPoint = (myLat, myLng, threatLat, threatLng, availablePoints) => {
  if (!availablePoints || availablePoints.length === 0) return null;

  let bestPoint = null;
  let shortestDistance = Infinity;
  let distToThreat = calculateDistance(myLat, myLng, threatLat, threatLng);

  availablePoints.forEach(point => {
    const distMeToPoint = calculateDistance(myLat, myLng, point.lat, point.lng);
    const distThreatToPoint = calculateDistance(threatLat, threatLng, point.lat, point.lng);

    // Rule 1: If I pressed the button, route me to the closest safe point.
    if (distToThreat < 20) {
        if (distMeToPoint < shortestDistance) {
            shortestDistance = distMeToPoint;
            bestPoint = point;
        }
    } 
    // Rule 2: If I am a bystander, ensure the Threat is further from the point than I am.
    else if (distThreatToPoint > distMeToPoint) {
      if (distMeToPoint < shortestDistance) {
        shortestDistance = distMeToPoint;
        bestPoint = point;
      }
    }
  });

  // Fallback: Head to the point furthest from the threat
  if (!bestPoint) {
      availablePoints.forEach(point => {
        const distThreatToPoint = calculateDistance(threatLat, threatLng, point.lat, point.lng);
        if (distThreatToPoint > shortestDistance || shortestDistance === Infinity) {
            shortestDistance = distThreatToPoint;
            bestPoint = point;
        }
      });
  }
  return bestPoint;
};

// ==========================================
// 📱 2. MAIN COMPONENT
// ==========================================
export default function HomeScreen() {
  const [studentName, setStudentName] = useState('');
  const [isLockdown, setIsLockdown] = useState(false); 
  
  const [threatCoords, setThreatCoords] = useState(null);
  const [myCoords, setMyCoords] = useState(null);
  const [deviceHeading, setDeviceHeading] = useState(0); 
  const [assignedRallyPoint, setAssignedRallyPoint] = useState(null);
  
  // 🔴 NEW STATE: Stores the zones pulled live from Firebase
  const [cloudRallyPoints, setCloudRallyPoints] = useState([]);

  useEffect(() => {
    // 1. Listen for active alerts
    const alertsRef = ref(database, 'alerts');
    const unsubAlerts = onValue(alertsRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        const activeAlert = Object.values(data).find(alert => alert.status === 'broadcasted');
        if (activeAlert) {
          setIsLockdown(true);
          setThreatCoords(activeAlert.coords);
        } else {
          setIsLockdown(false);
          setThreatCoords(null);
          setAssignedRallyPoint(null);
        }
      } else {
        setIsLockdown(false);
      }
    });

    // 2. 🔴 Listen for the Cloud Configuration (Safe Zones)
    const configRef = ref(database, 'config/rallyPoints');
    const unsubConfig = onValue(configRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        setCloudRallyPoints(Object.values(data)); // Convert Firebase object to Array
      } else {
        // Ultimate fallback just in case the database is totally empty
        setCloudRallyPoints([
          { name: "Default Global Rally Point", lat: 13.0827, lng: 80.2700 }
        ]);
      }
    });

    return () => { unsubAlerts(); unsubConfig(); }; 
  }, []);

  useEffect(() => {
    let locationSubscription;
    let headingSubscription;

    const startTracking = async () => {
      // 🔴 Make sure we have the cloud points loaded before doing math!
      if (isLockdown && threatCoords && cloudRallyPoints.length > 0) {
        locationSubscription = await Location.watchPositionAsync(
          { accuracy: Location.Accuracy.BestForNavigation, timeInterval: 1000, distanceInterval: 1 },
          (loc) => {
            setMyCoords(loc.coords);
            // Pass the cloud array into our math function
            const bestPoint = getBestRallyPoint(
                loc.coords.latitude, loc.coords.longitude, 
                threatCoords.latitude, threatCoords.longitude, 
                cloudRallyPoints
            );
            setAssignedRallyPoint(bestPoint);
          }
        );

        headingSubscription = await Location.watchHeadingAsync((headingData) => setDeviceHeading(headingData.magHeading));
        Vibration.vibrate([0, 1000, 500, 1000], true); 
      } else {
        Vibration.cancel();
      }
    };

    startTracking();
    return () => {
      if (locationSubscription) locationSubscription.remove();
      if (headingSubscription) headingSubscription.remove();
    };
  }, [isLockdown, threatCoords, cloudRallyPoints]); // Added cloudRallyPoints as a dependency

  const handlePress = async () => {
    if (studentName.trim() === '') return Alert.alert("Wait!", "Enter your name.");
    try {
      let { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') return;
      
      let location = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      
      push(ref(database, 'alerts'), {
        type: "PANIC_BUTTON_PRESSED",
        senderName: studentName,
        coords: { latitude: location.coords.latitude, longitude: location.coords.longitude },
        timestamp: serverTimestamp(),
        status: "pending" 
      });
      Alert.alert("SUCCESS", "Emergency alert sent.");
    } catch (error) { Alert.alert("ERROR", "Failed to send alert."); }
  };

  // ==========================================
  // 🎨 3. DYNAMIC UI RENDERING
  // ==========================================
  
  if (isLockdown && myCoords && threatCoords && assignedRallyPoint) {
    const distToRally = Math.round(calculateDistance(myCoords.latitude, myCoords.longitude, assignedRallyPoint.lat, assignedRallyPoint.lng));

    // If student has arrived at the Rally Point
    if (distToRally < 30) {
        Vibration.cancel();
        return (
          <View style={[styles.container, { backgroundColor: '#004d40' }]}>
             <Text style={styles.scatterTitle}>YOU ARE SAFE</Text>
             <Text style={styles.scatterSub}>You have reached {assignedRallyPoint.name}.</Text>
             <Text style={[styles.scatterSub, { marginTop: 20, color: '#b2dfdb' }]}>Stay here and await police instructions.</Text>
          </View>
        );
    }

    // Still running to the Rally Point: Point the compass AT the destination
    const bearingToRally = getBearing(myCoords.latitude, myCoords.longitude, assignedRallyPoint.lat, assignedRallyPoint.lng);
    const arrowRotation = bearingToRally - deviceHeading;

    return (
      <View style={[styles.container, { backgroundColor: '#b71c1c' }]}>
         <Text style={styles.scatterTitle}>EVACUATE</Text>
         <Text style={styles.scatterSub}>Head immediately to:</Text>
         <Text style={styles.destinationText}>{assignedRallyPoint.name}</Text>
         <Text style={styles.scatterSub}>({distToRally}m away)</Text>
         
         <View style={{ marginTop: 40, transform: [{ rotate: `${arrowRotation}deg` }] }}>
            <Text style={{ fontSize: 130 }}>⬆️</Text>
         </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.headerText}>Smart School Safe</Text>
      <TextInput style={styles.input} placeholder="Enter your Full Name" placeholderTextColor="#888" value={studentName} onChangeText={setStudentName} />
      <TouchableOpacity activeOpacity={0.7} style={styles.panicButton} onPress={handlePress}>
        <View style={styles.innerCircle}>
          <Text style={styles.buttonText}>EMERGENCY ALERT</Text>
        </View>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000000', alignItems: 'center', justifyContent: 'center', padding: 20 },
  headerText: { fontSize: 28, fontWeight: '900', color: '#ffffff', marginBottom: 40, letterSpacing: 1 },
  input: { width: '100%', backgroundColor: '#222', color: '#fff', padding: 15, borderRadius: 10, fontSize: 18, marginBottom: 40, textAlign: 'center', borderWidth: 1, borderColor: '#444' },
  panicButton: { width: 280, height: 280, backgroundColor: '#7f0000', borderRadius: 140, alignItems: 'center', justifyContent: 'center', elevation: 20, shadowColor: '#ff0000', shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.8, shadowRadius: 20 },
  innerCircle: { width: 240, height: 240, backgroundColor: '#d32f2f', borderRadius: 120, alignItems: 'center', justifyContent: 'center', borderWidth: 4, borderColor: '#ff6666' },
  buttonText: { color: '#ffffff', fontSize: 24, fontWeight: 'bold', textAlign: 'center' },
  
  scatterTitle: { fontSize: 40, fontWeight: '900', color: '#ffffff', textAlign: 'center', marginBottom: 5 },
  scatterSub: { fontSize: 20, color: '#e8f5e9', textAlign: 'center', marginBottom: 5, fontWeight: 'bold' },
  destinationText: { fontSize: 28, fontWeight: '900', color: '#ffeb3b', textAlign: 'center', marginTop: 10, marginBottom: 5 }
});