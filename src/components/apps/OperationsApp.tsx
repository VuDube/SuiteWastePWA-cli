import React, { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import * as L from 'leaflet';
import { useTranslation } from 'react-i18next';
import { DndContext, closestCenter, DragEndEvent, useSensor, useSensors, PointerSensor, TouchSensor, useDroppable, UniqueIdentifier } from '@dnd-kit/core';
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical } from 'lucide-react';
// Mock data
const initialTasks: Record<string, { id: string; content: string }[]> = {
  unassigned: [
    { id: 'T001', content: 'Special pickup at Sandton City' },
    { id: 'T002', content: 'E-waste collection from Midrand Corp' },
    { id: 'T003', content: 'Bulk waste removal in Soweto' },
  ],
  R001: [{ id: 'T004', content: 'Standard residential collection' }],
  R002: [],
  R003: [{ id: 'T005', content: 'Industrial park clearing' }],
};
const routes = [
  { id: 'R001', name: 'Route 1 (Sandton)' },
  { id: 'R002', name: 'Route 2 (Midrand)' },
  { id: 'R003', name: 'Route 3 (Soweto)' },
];
const joburgCenter: L.LatLngExpression = [-26.2041, 28.0473];
const vehiclePositions: Record<string, L.LatLngExpression> = {
  R001: [-26.1, 28.05],
  R002: [-26.0, 28.08],
  R003: [-26.25, 28.0],
};
const truckIcon = new L.Icon({
  iconUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon.png',
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon-2x.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-shadow.png',
  iconSize: [25, 41], iconAnchor: [12, 41], popupAnchor: [1, -34], shadowSize: [41, 41]
});
const TaskCard = ({ id, content }: { id: string; content: string }) => {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id });
  const style = { transform: CSS.Transform.toString(transform), transition };
  return (
    <div ref={setNodeRef} style={style} {...attributes} className="p-2.5 mb-2 bg-card border rounded-md shadow-sm flex items-center">
      <button {...listeners} className="cursor-grab p-1 -ml-1 mr-2 text-muted-foreground touch-none"><GripVertical size={16} /></button>
      <p className="text-sm flex-1">{content}</p>
    </div>
  );
};
const TaskColumn = ({ id, title, tasks }: { id: string; title: string; tasks: { id: string; content: string }[] }) => {
  const { setNodeRef } = useDroppable({ id });
  const taskIds = tasks.map(t => t.id);
  return (
    <Card className="flex-1 min-w-[250px] flex flex-col">
      <CardHeader><CardTitle className="text-base">{title}</CardTitle></CardHeader>
      <ScrollArea className="flex-1">
        <CardContent ref={setNodeRef} className="h-full p-4">
          <SortableContext id={id} items={taskIds} strategy={verticalListSortingStrategy}>
            {tasks.map(task => <TaskCard key={task.id} id={task.id} content={task.content} />)}
          </SortableContext>
        </CardContent>
      </ScrollArea>
    </Card>
  );
};
const OperationsApp: React.FC = () => {
  const { t } = useTranslation();
  const [tasks, setTasks] = useState(initialTasks);
  const sensors = useSensors(useSensor(PointerSensor), useSensor(TouchSensor));
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<L.Map | null>(null);
  useEffect(() => {
    if (mapRef.current && !mapInstance.current) {
      mapInstance.current = L.map(mapRef.current).setView(joburgCenter, 11);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
      }).addTo(mapInstance.current);
      routes.forEach(route => {
        L.marker(vehiclePositions[route.id], { icon: truckIcon })
          .addTo(mapInstance.current!)
          .bindPopup(route.name);
      });
    }
    return () => {
      if (mapInstance.current) {
        mapInstance.current.remove();
        mapInstance.current = null;
      }
    };
  }, []);
  const findContainer = (id: UniqueIdentifier) => {
    const idStr = String(id);
    if (idStr in tasks) return idStr;
    return Object.keys(tasks).find(key => tasks[key].some(item => item.id === idStr));
  };
  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over) return;
    const activeId = String(active.id);
    const overId = String(over.id);
    if (activeId === overId) return;
    const activeContainer = findContainer(active.id);
    const overContainer = findContainer(over.id);
    if (!activeContainer || !overContainer) return;
    setTasks(prev => {
      const newTasks = { ...prev };
      const activeItems = newTasks[activeContainer];
      const overItems = newTasks[overContainer];
      const activeIndex = activeItems.findIndex(item => item.id === activeId);
      if (activeContainer === overContainer) {
        // Reordering in same column
        const overIndex = overItems.findIndex(item => item.id === overId);
        const [movedItem] = activeItems.splice(activeIndex, 1);
        activeItems.splice(overIndex, 0, movedItem);
      } else {
        // Moving to a different column
        const [movedItem] = activeItems.splice(activeIndex, 1);
        // Check if dropping on a column or an item in a column
        const overIsContainer = overId in newTasks;
        if (overIsContainer) {
          newTasks[overId].push(movedItem);
        } else {
          const overItemIndex = overItems.findIndex(item => item.id === overId);
          overItems.splice(overItemIndex, 0, movedItem);
        }
      }
      return newTasks;
    });
  };
  return (
    <div className="h-full flex flex-col">
      <div className="flex-[2] bg-muted relative">
        <div ref={mapRef} className="h-full w-full" />
      </div>
      <div className="flex-[1] border-t p-4">
        <h2 className="text-xl font-bold mb-4">{t('apps.operations.taskBoard')}</h2>
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <div className="flex gap-4 h-[calc(100%-48px)] overflow-x-auto">
            <TaskColumn id="unassigned" title={t('apps.operations.unassignedTasks')} tasks={tasks.unassigned} />
            {routes.map(route => (
              <TaskColumn key={route.id} id={route.id} title={route.name} tasks={tasks[route.id]} />
            ))}
          </div>
        </DndContext>
      </div>
    </div>
  );
};
export default OperationsApp;