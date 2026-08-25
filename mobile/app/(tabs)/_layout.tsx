import { Tabs } from 'expo-router';
import React from 'react';
import { Text } from 'react-native';
import { useApp } from '../../src/state/AppContext';
const icon=(value:string)=><Text style={{fontSize:20}}>{value}</Text>;
export default function TabsLayout(){const{theme}=useApp();return <Tabs screenOptions={{headerShown:false,tabBarActiveTintColor:theme.colors.accent,tabBarInactiveTintColor:theme.colors.muted,tabBarStyle:{height:68,paddingBottom:8,paddingTop:6,backgroundColor:theme.colors.card,borderTopColor:theme.colors.border}}}><Tabs.Screen name="index" options={{title:'Início',tabBarIcon:()=>icon('⌂')}}/><Tabs.Screen name="map" options={{title:'Mapa',tabBarIcon:()=>icon('⌖')}}/><Tabs.Screen name="trips" options={{title:'Viagens',tabBarIcon:()=>icon('↑')}}/><Tabs.Screen name="community" options={{title:'Comunidade',tabBarIcon:()=>icon('◇')}}/><Tabs.Screen name="profile" options={{title:'Perfil',tabBarIcon:()=>icon('♙')}}/></Tabs>}
