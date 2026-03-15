import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import HomeScreen from '../screens/HomeScreen';

const Stack = createNativeStackNavigator();

export default function AppNavigator() {
  return (
    <NavigationContainer>
      <Stack.Navigator initialRouteName="Home">
        <Stack.Screen 
          name="Home" 
          component={HomeScreen} 
          options={{ 
            title: 'Smart School Safe', 
            headerStyle: { backgroundColor: '#121212' }, 
            headerTintColor: '#ffffff' 
          }} 
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
}