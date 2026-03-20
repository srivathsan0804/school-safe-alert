import React, { useEffect, useState, useRef } from 'react';
// 🔴 ADDED 'Modal' to the imports!
import { View, Text, TouchableOpacity, StyleSheet, Vibration, TextInput, Dimensions, Animated, Easing, SafeAreaView, Modal } from 'react-native';
import * as Location from 'expo-location';
import { database } from '../../firebaseConfig';
import { ref, push, serverTimestamp, onValue } from "firebase/database";

const { width } = Dimensions.get('window');

// ==========================================
// 🧠 1. GEOSPATIAL MATH & AI SECTOR ASSIGNMENT
// ==========================================
const calculateDistance = (lat1, lon1, lat2, lon2) => {
  const R = 6371e3; const toRad = (degrees) => degrees * (Math.PI / 180);
  const dLat = toRad(lat2 - lat1); const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return R * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
};

const getBearing = (startLat, startLng, destLat, destLng) => {
  const toRad = (deg) => (deg * Math.PI) / 180; const toDeg = (rad) => (rad * 180) / Math.PI;
  const lat1 = toRad(startLat); const lat2 = toRad(destLat); const dLng = toRad(destLng - startLng);
  const y = Math.sin(dLng) * Math.cos(lat2); const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
  return (toDeg(Math.atan2(y, x)) + 360) % 360; 
};

const getBestRallyPoint = (myLat, myLng, threatLat, threatLng, availablePoints) => {
  if (!availablePoints || availablePoints.length === 0) return null;
  let bestPoint = null; let shortestDistance = Infinity;
  let distToThreat = calculateDistance(myLat, myLng, threatLat, threatLng);

  availablePoints.forEach(point => {
    const distMeToPoint = calculateDistance(myLat, myLng, point.lat, point.lng);
    const distThreatToPoint = calculateDistance(threatLat, threatLng, point.lat, point.lng);
    if (distToThreat < 20) {
        if (distMeToPoint < shortestDistance) { shortestDistance = distMeToPoint; bestPoint = point; }
    } else if (distThreatToPoint > distMeToPoint) {
      if (distMeToPoint < shortestDistance) { shortestDistance = distMeToPoint; bestPoint = point; }
    }
  });

  if (!bestPoint) {
      availablePoints.forEach(point => {
        const distThreatToPoint = calculateDistance(threatLat, threatLng, point.lat, point.lng);
        if (distThreatToPoint > shortestDistance || shortestDistance === Infinity) { shortestDistance = distThreatToPoint; bestPoint = point; }
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
  const [cloudRallyPoints, setCloudRallyPoints] = useState([]);

  // 🔴 NEW STATE: For the custom popup
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [modalMessage, setModalMessage] = useState({ title: '', body: '', isError: false });

  // 🎨 UI ANIMATION HOOKS
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const warningFlash = useRef(new Animated.Value(1)).current;
  const radarSpin = useRef(new Animated.Value(0)).current;
  const popupScale = useRef(new Animated.Value(0)).current; // 🔴 NEW: Spring animation for popup

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.08, duration: 1500, easing: Easing.out(Easing.ease), useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 1500, easing: Easing.in(Easing.ease), useNativeDriver: true })
      ])
    ).start();
  }, []);

  useEffect(() => {
    if (isLockdown) {
        Animated.loop(
          Animated.sequence([
            Animated.timing(warningFlash, { toValue: 0.2, duration: 600, useNativeDriver: true }),
            Animated.timing(warningFlash, { toValue: 1, duration: 600, useNativeDriver: true })
          ])
        ).start();

        Animated.loop(
            Animated.timing(radarSpin, { toValue: 1, duration: 2500, easing: Easing.linear, useNativeDriver: true })
        ).start();
    } else { radarSpin.setValue(0); }
  }, [isLockdown]);

  const spinDegree = radarSpin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });

  useEffect(() => {
    const alertsRef = ref(database, 'alerts');
    const unsubAlerts = onValue(alertsRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        const activeAlert = Object.values(data).find(alert => alert.status === 'broadcasted');
        if (activeAlert) {
          setIsLockdown(true); setThreatCoords(activeAlert.coords);
          setShowSuccessModal(false); // Hide popup instantly if lockdown starts
        } else {
          setIsLockdown(false); setThreatCoords(null); setAssignedRallyPoint(null);
        }
      } else { setIsLockdown(false); }
    });

    const configRef = ref(database, 'config/rallyPoints');
    const unsubConfig = onValue(configRef, (snapshot) => {
      const data = snapshot.val();
      if (data) { setCloudRallyPoints(Object.values(data)); } 
      else { setCloudRallyPoints([{ name: "Global Rally Point", lat: 13.0827, lng: 80.2700 }]); }
    });
    return () => { unsubAlerts(); unsubConfig(); }; 
  }, []);

  useEffect(() => {
    let locationSubscription; let headingSubscription;
    const startTracking = async () => {
      if (isLockdown && threatCoords && cloudRallyPoints.length > 0) {
        locationSubscription = await Location.watchPositionAsync(
          { accuracy: Location.Accuracy.BestForNavigation, timeInterval: 1000, distanceInterval: 1 },
          (loc) => {
            setMyCoords(loc.coords);
            const bestPoint = getBestRallyPoint(loc.coords.latitude, loc.coords.longitude, threatCoords.latitude, threatCoords.longitude, cloudRallyPoints);
            setAssignedRallyPoint(bestPoint);
          }
        );
        headingSubscription = await Location.watchHeadingAsync((headingData) => setDeviceHeading(headingData.magHeading));
        Vibration.vibrate([0, 1000, 500, 1000], true); 
      } else { Vibration.cancel(); }
    };
    startTracking();
    return () => {
      if (locationSubscription) locationSubscription.remove();
      if (headingSubscription) headingSubscription.remove();
    };
  }, [isLockdown, threatCoords, cloudRallyPoints]);

  // 🔴 UPDATED: Triggers the custom animated popup instead of Alert.alert
  const triggerPopup = (title, body, isError = false) => {
    setModalMessage({ title, body, isError });
    setShowSuccessModal(true);
    // Spring physics makes it "bounce" in like a heavy piece of UI
    Animated.spring(popupScale, {
      toValue: 1,
      friction: 6,
      tension: 40,
      useNativeDriver: true
    }).start();
  };

  const closePopup = () => {
    Animated.timing(popupScale, { toValue: 0, duration: 200, useNativeDriver: true }).start(() => {
        setShowSuccessModal(false);
    });
  };

  const handlePress = async () => {
    if (studentName.trim() === '') return triggerPopup("ACCESS DENIED", "Operator ID required for authentication.", true);
    
    try {
      let { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') return triggerPopup("GPS OFFLINE", "Location services required for tracking.", true);
      
      let location = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      
      push(ref(database, 'alerts'), {
        type: "PANIC_BUTTON_PRESSED", senderName: studentName,
        coords: { latitude: location.coords.latitude, longitude: location.coords.longitude },
        timestamp: serverTimestamp(), status: "pending" 
      });
      
      triggerPopup("SIGNAL SECURED", "Encrypted distress beacon active. Awaiting Command Center broadcast.");
    } catch (error) { triggerPopup("NETWORK FAILURE", "Connection to secure server failed.", true); }
  };

  // ==========================================
  // 🎨 3. DYNAMIC UI RENDERING (PREMIUM)
  // ==========================================
  
  if (isLockdown && myCoords && threatCoords && assignedRallyPoint) {
    const distToRally = Math.round(calculateDistance(myCoords.latitude, myCoords.longitude, assignedRallyPoint.lat, assignedRallyPoint.lng));

    // UI: THE SAFE ZONE 
    if (distToRally < 30) {
        Vibration.cancel();
        return (
          <SafeAreaView style={[styles.container, { backgroundColor: '#04140a' }]}>
             <View style={styles.glassPanelSuccess}>
                 <View style={styles.shieldIcon}><Text style={{fontSize: 60}}>🛡️</Text></View>
                 <Text style={styles.safeTitle}>ZONE SECURED</Text>
                 <View style={styles.divider} />
                 <Text style={styles.hudLabel}>CURRENT LOCATION</Text>
                 <Text style={styles.destinationText}>{assignedRallyPoint.name}</Text>
             </View>
             <Text style={styles.safeSub}>Maintain silence. Await tactical clearance.</Text>
          </SafeAreaView>
        );
    }

    // UI: THE TACTICAL HUD (EVACUATING)
    const bearingToRally = getBearing(myCoords.latitude, myCoords.longitude, assignedRallyPoint.lat, assignedRallyPoint.lng);
    const arrowRotation = bearingToRally - deviceHeading;

    return (
      <SafeAreaView style={[styles.container, { backgroundColor: '#0f0505' }]}>
         <Animated.View style={[styles.warningBanner, { opacity: warningFlash }]}>
            <Text style={styles.warningBannerText}>CRITICAL THREAT DETECTED</Text>
         </Animated.View>

         <View style={styles.compassWrapper}>
             <View style={styles.compassOuterRing}>
                <View style={styles.compassInnerRing}>
                    <Animated.View style={[styles.radarContainer, { transform: [{ rotate: spinDegree }] }]}>
                        <View style={styles.radarLaser} />
                        <View style={styles.radarFade} />
                    </Animated.View>
                    <View style={{ transform: [{ rotate: `${arrowRotation}deg` }] }}>
                        <Text style={styles.tacticalArrow}>↑</Text> 
                    </View>
                    <View style={styles.centerPin} />
                </View>
             </View>
         </View>

         <View style={styles.glassPanelDanger}>
            <View style={styles.dataRow}>
                <View style={styles.dataBlock}>
                    <Text style={styles.hudLabel}>TARGET VECTOR</Text>
                    <Text style={styles.destinationText}>{assignedRallyPoint.name}</Text>
                </View>
            </View>
            <View style={styles.dividerDanger} />
            <View style={styles.dataRow}>
                <View style={styles.dataBlock}>
                    <Text style={styles.hudLabel}>> LIVE_DISTANCE_TRACKING...</Text>
                    <Text style={styles.distanceText}>
                        <Text style={{color: '#666', fontSize: 24}}>[ </Text>
                        {distToRally}
                        <Text style={styles.metricText}>m</Text>
                        <Text style={{color: '#666', fontSize: 24}}> ]</Text>
                    </Text>
                </View>
            </View>
         </View>
      </SafeAreaView>
    );
  }

  // UI: THE IDLE STATE (SOS BUTTON)
  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.logoText}>SAFE<Text style={{color: '#ff2a2a'}}>CAMPUS</Text></Text>
        <Text style={styles.subHeaderText}>ENCRYPTED SECURITY PROTOCOL</Text>
      </View>
      
      <View style={styles.inputContainer}>
        <Text style={styles.inputLabel}>OPERATOR ID</Text>
        <TextInput style={styles.input} placeholder="Enter Full Name" placeholderTextColor="#444" value={studentName} onChangeText={setStudentName} autoCorrect={false} />
      </View>

      <TouchableOpacity activeOpacity={0.9} onPress={handlePress} style={styles.buttonWrapper}>
        <View style={styles.ringOuter}>
           <View style={styles.ringMiddle}>
              <Animated.View style={[styles.ringInner, { transform: [{ scale: pulseAnim }] }]}>
                <Text style={styles.buttonText}>SOS</Text>
              </Animated.View>
           </View>
        </View>
      </TouchableOpacity>
      
      <Text style={styles.footerText}>SYSTEM ONLINE  •  GPS ACTIVE</Text>

      {/* 🔴 NEW: The Custom Cinematic Modal */}
      <Modal transparent={true} visible={showSuccessModal} animationType="fade">
        <View style={styles.modalOverlay}>
            <Animated.View style={[
                styles.modalBox, 
                { transform: [{ scale: popupScale }] },
                modalMessage.isError ? { borderColor: '#ff2a2a', shadowColor: '#ff2a2a' } : { borderColor: '#4caf50', shadowColor: '#4caf50' }
            ]}>
                <Text style={styles.modalIcon}>{modalMessage.isError ? '⚠️' : '📡'}</Text>
                <Text style={[styles.modalTitle, modalMessage.isError ? {color: '#ff2a2a'} : {color: '#4caf50'}]}>
                    {modalMessage.title}
                </Text>
                <Text style={styles.modalBody}>{modalMessage.body}</Text>
                
                <TouchableOpacity 
                    style={[styles.modalBtn, modalMessage.isError ? {backgroundColor: 'rgba(255, 42, 42, 0.15)'} : {backgroundColor: 'rgba(76, 175, 80, 0.15)'}]} 
                    onPress={closePopup}
                >
                    <Text style={[styles.modalBtnText, modalMessage.isError ? {color: '#ff2a2a'} : {color: '#4caf50'}]}>
                        ACKNOWLEDGE
                    </Text>
                </TouchableOpacity>
            </Animated.View>
        </View>
      </Modal>

    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#09090b', alignItems: 'center', justifyContent: 'space-between', padding: 25 },
  
  header: { alignItems: 'center', marginTop: 40, width: '100%' },
  logoText: { fontSize: 28, fontWeight: '900', color: '#ffffff', letterSpacing: 4, marginBottom: 8 },
  subHeaderText: { fontSize: 11, color: '#666', textTransform: 'uppercase', letterSpacing: 3, fontWeight: '600' },
  
  inputContainer: { width: '100%', marginTop: 30 },
  inputLabel: { color: '#666', fontSize: 10, letterSpacing: 2, marginBottom: 8, fontWeight: '700', marginLeft: 5 },
  input: { width: '100%', backgroundColor: '#121214', color: '#fff', padding: 18, borderRadius: 16, fontSize: 16, fontWeight: '600', borderWidth: 1, borderColor: '#222' },
  
  buttonWrapper: { marginTop: 40, marginBottom: 20 },
  ringOuter: { width: width * 0.8, height: width * 0.8, borderRadius: width * 0.4, backgroundColor: 'rgba(255, 42, 42, 0.03)', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(255, 42, 42, 0.05)' },
  ringMiddle: { width: width * 0.65, height: width * 0.65, borderRadius: width * 0.325, backgroundColor: 'rgba(255, 42, 42, 0.08)', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(255, 42, 42, 0.1)' },
  ringInner: { width: width * 0.5, height: width * 0.5, borderRadius: width * 0.25, backgroundColor: '#ff2a2a', alignItems: 'center', justifyContent: 'center', shadowColor: '#ff2a2a', shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.6, shadowRadius: 30, elevation: 20 },
  buttonText: { color: '#ffffff', fontSize: 42, fontWeight: '900', letterSpacing: 4 },
  
  footerText: { color: '#333', fontSize: 10, letterSpacing: 2, fontWeight: '700', marginBottom: 20 },

  // --- CUSTOM POPUP MODAL STYLES ---
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0, 0, 0, 0.85)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  modalBox: { width: '100%', backgroundColor: '#121214', padding: 30, borderRadius: 20, borderWidth: 1, alignItems: 'center', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.5, shadowRadius: 20 },
  modalIcon: { fontSize: 40, marginBottom: 15 },
  modalTitle: { fontSize: 20, fontWeight: '900', letterSpacing: 2, marginBottom: 10, textAlign: 'center' },
  modalBody: { color: '#aaa', fontSize: 14, textAlign: 'center', lineHeight: 22, marginBottom: 30 },
  modalBtn: { width: '100%', padding: 15, borderRadius: 10, alignItems: 'center' },
  modalBtnText: { fontWeight: '800', letterSpacing: 2, fontSize: 14 },

  warningBanner: { width: '100%', backgroundColor: 'rgba(255, 42, 42, 0.15)', padding: 15, borderRadius: 8, borderWidth: 1, borderColor: 'rgba(255, 42, 42, 0.4)', alignItems: 'center', marginTop: 20 },
  warningBannerText: { color: '#ff2a2a', fontSize: 14, fontWeight: '900', letterSpacing: 3 },
  
  compassWrapper: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  compassOuterRing: { width: 300, height: 300, borderRadius: 150, borderWidth: 2, borderColor: 'rgba(255,255,255,0.05)', alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.02)' },
  compassInnerRing: { width: 260, height: 260, borderRadius: 130, borderWidth: 1, borderColor: 'rgba(255, 42, 42, 0.3)', alignItems: 'center', justifyContent: 'center', backgroundColor: '#0a0a0c', shadowColor: '#ff2a2a', shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.2, shadowRadius: 20, overflow: 'hidden' },
  tacticalArrow: { fontSize: 120, color: '#ffffff', fontWeight: '200', textShadowColor: '#ff2a2a', textShadowOffset: {width: 0, height: 0}, textShadowRadius: 15, marginTop: -20, zIndex: 10 },
  
  radarContainer: { position: 'absolute', width: '100%', height: '100%', alignItems: 'center', justifyContent: 'center', zIndex: 1 },
  radarLaser: { position: 'absolute', top: '50%', right: 0, width: '50%', height: 2, backgroundColor: '#ff2a2a', shadowColor: '#ff2a2a', shadowOffset: { width: 0, height: 0 }, shadowOpacity: 1, shadowRadius: 10, elevation: 5 },
  radarFade: { position: 'absolute', top: 0, right: 0, width: '50%', height: '50%', backgroundColor: 'rgba(255, 42, 42, 0.05)', borderBottomWidth: 0, borderRightWidth: 0 },
  centerPin: { position: 'absolute', width: 12, height: 12, borderRadius: 6, backgroundColor: '#ff2a2a', zIndex: 20, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.8, shadowRadius: 4 },

  glassPanelDanger: { width: '100%', backgroundColor: 'rgba(255, 255, 255, 0.03)', borderRadius: 20, padding: 25, borderWidth: 1, borderColor: 'rgba(255, 255, 255, 0.08)', marginBottom: 20 },
  dataRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
  dataBlock: { flex: 1 },
  dividerDanger: { height: 1, backgroundColor: 'rgba(255, 255, 255, 0.1)', marginVertical: 15 },
  
  hudLabel: { fontSize: 11, color: '#888', fontWeight: '700', letterSpacing: 2, marginBottom: 5, fontFamily: 'monospace' },
  destinationText: { fontSize: 24, fontWeight: '800', color: '#ffffff', letterSpacing: 1 },
  distanceText: { fontSize: 40, color: '#ff2a2a', fontWeight: '900', fontFamily: 'monospace', textShadowColor: 'rgba(255, 42, 42, 0.4)', textShadowOffset: {width: 0, height: 2}, textShadowRadius: 10 },
  metricText: { fontSize: 20, color: '#888', fontWeight: '600' },

  glassPanelSuccess: { width: '100%', backgroundColor: 'rgba(76, 175, 80, 0.05)', borderRadius: 20, padding: 40, borderWidth: 1, borderColor: 'rgba(76, 175, 80, 0.2)', alignItems: 'center', marginTop: 60 },
  shieldIcon: { width: 100, height: 100, borderRadius: 50, backgroundColor: 'rgba(76, 175, 80, 0.1)', alignItems: 'center', justifyContent: 'center', marginBottom: 20, borderWidth: 1, borderColor: 'rgba(76, 175, 80, 0.3)' },
  safeTitle: { fontSize: 28, fontWeight: '900', color: '#4caf50', letterSpacing: 3 },
  divider: { width: '100%', height: 1, backgroundColor: 'rgba(76, 175, 80, 0.2)', marginVertical: 30 },
  safeSub: { fontSize: 12, color: '#888', textAlign: 'center', fontWeight: '600', letterSpacing: 2, textTransform: 'uppercase', marginBottom: 40 }
});