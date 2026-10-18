import {
  MdAccountTree,
  MdAccountCircle,
  MdAdd,
  MdAddPhotoAlternate,
  MdArchitecture,
  MdArrowUpward,
  MdArrowRightAlt,
  MdAttachFile,
  MdAutorenew,
  MdAutoAwesome,
  MdBackupTable,
  MdBrush,
  MdCheckBoxOutlineBlank,
  MdCheck,
  MdClose,
  MdCode,
  MdDataObject,
  MdDateRange,
  MdDelete,
  MdDeviceHub,
  MdDiamond,
  MdDownload,
  MdDriveFileRenameOutline,
  MdEast,
  MdCenterFocusStrong,
  MdFormatPaint,
  MdGesture,
  MdHexagon,
  MdHistory,
  MdHub,
  MdImage,
  MdInsertDriveFile,
  MdInsertPhoto,
  MdIntegrationInstructions,
  MdKeyboardArrowDown,
  MdKeyboardArrowLeft,
  MdMenu,
  MdMemory,
  MdNorthEast,
  MdOpenWith,
  MdRadioButtonUnchecked,
  MdRefresh,
  MdRemove,
  MdSave,
  MdSchema,
  MdSearch,
  MdShowChart,
  MdStorage,
  MdTimeline,
  MdTouchApp,
  MdTune,
  MdUndo,
  MdRedo,
  MdVisibility,
  MdVisibilityOff,
  MdDashboard,
  MdDonutLarge,
  MdViewInAr,
  MdZoomIn,
  MdZoomOut,
  MdCloud,
  MdInfoOutline,
  MdEditNote,
  MdErrorOutline,
  MdSwitchLeft,
  MdSwitchRight,
  MdFolder,
  MdModeEdit,
  MdOutlineFeedback,
  MdShare,
  MdOutlineIosShare,
  MdContentCopy,
  MdLock,
  MdPublic,
  MdLink,
} from 'react-icons/md';

const googleIcon = (Icon, minSize = 16) => {
  const GoogleIcon = ({ size = 20, strokeWidth, ...props }) => {
    const numericSize = Number(size);
    const resolvedSize = Number.isFinite(numericSize) ? Math.max(numericSize, minSize) : size;

    return <Icon size={resolvedSize} {...props} />;
  };

  return GoogleIcon;
};

export const Search = googleIcon(MdSearch);
export const User = googleIcon(MdAccountCircle);
export const ArrowUp = googleIcon(MdNorthEast);
export const Send = googleIcon(MdArrowUpward);
export const Layout = googleIcon(MdDashboard);
export const Zap = googleIcon(MdAutoAwesome);
export const Boxes = googleIcon(MdViewInAr);
export const Plus = googleIcon(MdAdd);
export const Network = googleIcon(MdSchema);
export const Layers = googleIcon(MdArchitecture);
export const LineChart = googleIcon(MdShowChart);
export const PieChart = googleIcon(MdDonutLarge);
export const ChevronLeft = googleIcon(MdKeyboardArrowLeft);
export const Grid = googleIcon(MdDashboard);
export const ImagePlus = googleIcon(MdAddPhotoAlternate);
export const Paperclip = googleIcon(MdAttachFile);
export const GitBranch = googleIcon(MdDeviceHub);
export const Image = googleIcon(MdImage);
export const PenTool = googleIcon(MdDriveFileRenameOutline);
export const SlidersHorizontal = googleIcon(MdTune);
export const ArrowDown = googleIcon(MdKeyboardArrowDown);
export const History = googleIcon(MdHistory);
export const X = googleIcon(MdClose);
export const MessageSquareDot = googleIcon(MdTimeline);
export const Table2 = googleIcon(MdBackupTable);
export const CalendarRange = googleIcon(MdDateRange);

export const Menu = googleIcon(MdMenu);
export const Save = googleIcon(MdSave);
export const Trash2 = googleIcon(MdDelete);
export const Download = googleIcon(MdDownload);
export const Palette = googleIcon(MdFormatPaint);
export const MousePointer2 = googleIcon(MdTouchApp);
export const Move = googleIcon(MdOpenWith);
export const Undo = googleIcon(MdUndo);
export const Redo = googleIcon(MdRedo);
export const ZoomIn = googleIcon(MdZoomIn);
export const ZoomOut = googleIcon(MdZoomOut);
export const Maximize = googleIcon(MdCenterFocusStrong);
export const Check = googleIcon(MdCheck);
export const ChevronDown = googleIcon(MdKeyboardArrowDown);
export const FileCode = googleIcon(MdIntegrationInstructions);
export const FileText = googleIcon(MdInsertDriveFile);
export const FileImage = googleIcon(MdInsertPhoto);
export const Code2 = googleIcon(MdCode);
export const Minus = googleIcon(MdRemove);
export const Cpu = googleIcon(MdMemory);
export const Square = googleIcon(MdCheckBoxOutlineBlank);
export const Circle = googleIcon(MdRadioButtonUnchecked);
export const Hexagon = googleIcon(MdHexagon);
export const Database = googleIcon(MdStorage);
export const MessageSquare = googleIcon(MdTimeline);
export const Diamond = googleIcon(MdDiamond);
export const Box = googleIcon(MdViewInAr);
export const ArrowRight = googleIcon(MdEast);
export const Eye = googleIcon(MdVisibility);
export const EyeOff = googleIcon(MdVisibilityOff);
export const ShareIcon = googleIcon(MdOutlineIosShare);
export const ShareNodesIcon = googleIcon(MdShare);
export const CopyIcon = googleIcon(MdContentCopy);
export const LockIcon = googleIcon(MdLock);
export const PublicIcon = googleIcon(MdPublic);
export const LinkIcon = googleIcon(MdLink);
export const RefreshCw = googleIcon(MdRefresh);
export const Loader2 = googleIcon(MdAutorenew);
export const Brush = googleIcon(MdGesture);
export const Cloud = googleIcon(MdCloud);
export const Info = googleIcon(MdInfoOutline);
export const ScratchPad = googleIcon(MdEditNote);
export const ErrorOutline = googleIcon(MdErrorOutline);
export const SwitchLeft = googleIcon(MdSwitchLeft);
export const SwitchRight = googleIcon(MdSwitchRight);
export const Edit = googleIcon(MdModeEdit);
import {
  HiOutlinePaintBrush,
  HiOutlineFolder,
} from 'react-icons/hi2';

export const Paintbrush = googleIcon(HiOutlinePaintBrush);
export const FolderIcon = googleIcon(HiOutlineFolder);

import {
  MdCategory, MdBubbleChart, MdGridView, MdEventNote, MdRadar, MdViewKanban, MdFilterFrames,
  MdTableRows, MdTripOrigin, MdDirectionsWalk, MdApps, MdAssignment,
  MdForkLeft, MdWidgets, MdPsychology, MdViewTimeline, MdGrain, MdViewModule,
  MdGroupWork, MdExplore, MdSupervisedUserCircle
} from 'react-icons/md';

export const Category = googleIcon(MdCategory);
export const BubbleChart = googleIcon(MdBubbleChart);
export const GridView = googleIcon(MdGridView);
export const EventNote = googleIcon(MdEventNote);
export const Radar = googleIcon(MdRadar);
export const ViewKanban = googleIcon(MdViewKanban);
export const FilterFrames = googleIcon(MdFilterFrames);

export const Swimlane = googleIcon(MdTableRows);
export const ClassIcon = googleIcon(MdDataObject);
export const StateIcon = googleIcon(MdTripOrigin);
export const UserJourneyIcon = googleIcon(MdDirectionsWalk);
export const QuadrantIcon = googleIcon(MdApps);
export const RequirementIcon = googleIcon(MdAssignment);
export const GitGraphIcon = googleIcon(MdForkLeft);
export const C4Icon = googleIcon(MdWidgets);
export const MindmapIcon = googleIcon(MdPsychology);
export const TimelineIcon = googleIcon(MdViewTimeline);
export const SankeyIcon = googleIcon(MdGrain);
export const BlockIcon = googleIcon(MdViewModule);
export const VennIcon = googleIcon(MdGroupWork);
export const WardleyIcon = googleIcon(MdExplore);
export const TreeViewIcon = googleIcon(MdAccountTree);
export const UseCaseIcon = googleIcon(MdSupervisedUserCircle);


export const ArkaLogo = ({ size = 28, className = "", ...props }) => (
  <svg
    className={className}
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 100 100"
    width={size}
    height={size}
    fill="currentColor"
    {...props}
  >
    <path
      d="
        M 50 10
        C 53 10, 56 12, 59 18
        L 92 75
        C 95 80, 96 85, 92 88
        C 88 91, 80 91, 75 88
        C 70 85, 62 70, 60 65
        C 58 60, 55 45, 50 45
        C 45 45, 42 60, 40 65
        C 38 70, 30 85, 25 88
        C 20 91, 12 91, 8 88
        C 4 85, 5 80, 8 75
        L 41 18
        C 44 12, 47 10, 50 10
        Z"
    />
  </svg>
);

export const CustomSparkleIcon = ({ size = 20, className = "", ...props }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    height={size}
    viewBox="0 -960 960 960"
    width={size}
    fill="currentColor"
    className={className}
    {...props}
  >
    <path d="M480-240 63-467l84-46 333 182 333-182 84 46-417 227Zm0 160L63-307l84-46 333 182 333-182 84 46L480-80Zm0-320L40-640l440-240 40 22v178h327l73 40-440 240Zm0-91 200-109H440v-167L207-640l273 149Zm-40-109Z"/>
  </svg>
);

export const MySpaceIcon = CustomSparkleIcon;

export const SaveAddIcon = ({ size = 20, className = "", ...props }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    height={size}
    viewBox="0 -960 960 960"
    width={size}
    fill="currentColor"
    className={className}
    {...props}
  >
    <path d="M200-120v-640q0-33 23.5-56.5T280-840h240v80H280v518l200-86 200 86v-278h80v400L480-240 200-120Zm80-640h240-240Zm400 160v-80h-80v-80h80v-80h80v80h80v80h-80v80h-80Z"/>
  </svg>
);

export const SaveCheckedIcon = ({ size = 20, className = "", ...props }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    height={size}
    viewBox="0 -960 960 960"
    width={size}
    fill="currentColor"
    className={className}
    {...props}
  >
    <path d="M713-600 600-713l56-57 57 57 141-142 57 57-198 198ZM200-120v-640q0-33 23.5-56.5T280-840h240v80H280v518l200-86 200 86v-278h80v400L480-240 200-120Zm80-640h240-240Z"/>
  </svg>
);

export const SaveFilledIcon = ({ size = 20, className = "", ...props }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    height={size}
    viewBox="0 -960 960 960"
    width={size}
    fill="currentColor"
    className={className}
    {...props}
  >
    <path d="M200-120v-640q0-33 23.5-56.5T280-840h400q33 0 56.5 23.5T760-760v640L480-240 200-120Z"/>
  </svg>
);

export const ConstructionIcon = ({ size = 24, className = "", color = "currentColor", ...props }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    height={size}
    viewBox="0 -960 960 960"
    width={size}
    fill={color}
    className={className}
    {...props}
  >
    <path d="M756-120 537-339l84-84 219 219-84 84Zm-552 0-84-84 276-276-68-68-28 28-51-51v82l-28 28-121-121 28-28h82l-50-50 142-142q20-20 43-29t47-9q24 0 47 9t43 29l-92 92 50 50-28 28 68 68 90-90q-4-11-6.5-23t-2.5-24q0-59 40.5-99.5T701-841q15 0 28.5 3t27.5 9l-99 99 72 72 99-99q7 14 9.5 27.5T841-701q0 59-40.5 99.5T701-561q-12 0-24-2t-23-7L204-120Z"/>
  </svg>
);

export const GithubIcon = ({ size = 18, className = "", color = "currentColor", ...props }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill={color}
    className={className}
    {...props}
  >
    <path fillRule="evenodd" clipRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" />
  </svg>
);

import { LuMessageSquarePlus } from 'react-icons/lu';

export const FeedbackIcon = ({ size = 20, className = "", ...props }) => (
  <LuMessageSquarePlus size={size} className={className} {...props} />
);
