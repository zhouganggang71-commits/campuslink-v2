/**
 * 业务层聚合入口 — 合并各领域操作 hook
 */
import { Listing, Course, Message, StudentProfile } from '../types';
import { usePostActions } from './usePostActions';
import { useAuthActions } from './useAuthActions';
import { useCourseActions } from './useCourseActions';
import { useMessageActions } from './useMessageActions';

export function useAppActions(d: {
  profile: StudentProfile;
  setProfile: React.Dispatch<React.SetStateAction<StudentProfile>>;
  listings: Listing[];
  setListings: React.Dispatch<React.SetStateAction<Listing[]>>;
  courses: Course[];
  setCourses: React.Dispatch<React.SetStateAction<Course[]>>;
  messages: Message[];
  setMessages: React.Dispatch<React.SetStateAction<Message[]>>;
  savedListingIds: string[];
  setSavedListingIds: React.Dispatch<React.SetStateAction<string[]>>;
  selectedListing: Listing | null;
  setSelectedListing: React.Dispatch<React.SetStateAction<Listing | null>>;
  setActiveTab: React.Dispatch<React.SetStateAction<string>>;
  setIsAuthModalOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setIsAddCourseOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setIsShareModalOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setShareWeek: React.Dispatch<React.SetStateAction<number>>;
  setEditingListing: React.Dispatch<React.SetStateAction<Listing | null>>;
  setCarouselIndex: React.Dispatch<React.SetStateAction<number>>;
  courseForm: any;
  setCourseForm: React.Dispatch<React.SetStateAction<any>>;
  editingListing: Listing | null;
  lastPublishTime: React.MutableRefObject<number>;
  reportedPostIds: React.MutableRefObject<Set<string>>;
  PUBLISH_COOLDOWN: number;
  MAX_POSTS_PER_DAY: number;
  MAX_POSTS_UNVERIFIED: number;
  showToast: (msg: string, type?: 'success' | 'info') => void;
  getTodayPostCount: () => number;
  syncCourses: () => void;
  syncPosts: () => void;
  syncFavorites: () => void;
}) {
  const { toggleSaveListing, openListingDetails, handleDelete, handleCopyContact, handleReport, handleStartEdit, handlePublish } = usePostActions(d);
  const { handleAuth } = useAuthActions(d);
  const { handleAddCourse, handleDeleteCourse, handleImportCourses, handleShareSchedule } = useCourseActions(d);
  const { handleMarkMessageRead, handleMarkAllRead } = useMessageActions(d);

  return {
    toggleSaveListing,
    openListingDetails,
    handleMarkMessageRead,
    handleMarkAllRead,
    handleDelete,
    handleCopyContact,
    handleReport,
    handleStartEdit,
    handlePublish,
    handleAddCourse,
    handleDeleteCourse,
    handleImportCourses,
    handleAuth,
    handleShareSchedule,
  };
}
